// 스키마 적용 및 마이그레이션 실행 (async).
import { getDb } from './connection.js';
import { nowSeoulStamp } from '../lib/time.js';
import { SCHEMA_SQL } from './schema-sql.js';

export const SCHEMA_VERSION = 3;

/** 테이블에 특정 컬럼이 있는지 확인 */
async function hasColumn(db, table, column) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  // D1은 PRAGMA table_info를 지원. 어댑터 exec는 PRAGMA를 스킵하지만 all은 직접 실행됨.
  return (cols || []).some((c) => c.name === column);
}

/** 접속 코드 생성 (사람이 읽기 쉬운 영숫자, 혼동 문자 제외) */
export function generateAccessCode(prefix) {
  const chars = 'ACDEFGHJKLMNPQRSTUVWXY34679'; // 0/O/1/I/B8 등 혼동 제외
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s}`;
}

/** 테이블에서 중복되지 않는 고유 코드 생성 */
export async function uniqueCode(db, prefix, table) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const code = generateAccessCode(prefix);
    const dup = await db.get(`SELECT 1 AS x FROM ${table} WHERE access_code = ?`, [code]);
    if (!dup) return code;
  }
  // 극히 드문 충돌: 타임스탬프 접미사
  return `${generateAccessCode(prefix)}${Date.now().toString().slice(-3)}`;
}

/**
 * 스키마를 적용(IF NOT EXISTS 기반 idempotent)하고 버전을 기록한다.
 * 로컬/D1 공통으로 동작 (db.exec은 어댑터가 문장 분리 처리).
 */
export async function runMigrations() {
  const db = getDb();
  await db.exec(SCHEMA_SQL);

  const row = await db.get("SELECT value FROM schema_meta WHERE key = 'version'");
  const current = row ? Number(row.value) : 0;

  const migrations = [
    {
      to: 2,
      up: async (db) => {
        // 기존 DB에 access_code 컬럼이 없으면 추가
        if (!(await hasColumn(db, 'teachers', 'access_code'))) {
          await db.run('ALTER TABLE teachers ADD COLUMN access_code TEXT', []);
        }
        if (!(await hasColumn(db, 'students', 'access_code'))) {
          await db.run('ALTER TABLE students ADD COLUMN access_code TEXT', []);
        }
        // 코드가 없는 기존 강사/학생에게 코드 자동 부여
        const teachers = await db.all('SELECT id FROM teachers WHERE access_code IS NULL OR access_code = ?', ['']);
        for (const t of teachers) {
          await db.run('UPDATE teachers SET access_code = ? WHERE id = ?', [await uniqueCode(db, 'T', 'teachers'), t.id]);
        }
        const students = await db.all('SELECT id FROM students WHERE access_code IS NULL OR access_code = ?', ['']);
        for (const s of students) {
          await db.run('UPDATE students SET access_code = ? WHERE id = ?', [await uniqueCode(db, 'S', 'students'), s.id]);
        }
      },
    },
    {
      to: 3,
      up: async (db) => {
        // 학생 자가 점수 입력(제출→승인) 지원 컬럼. 기존 행은 모두 확정(confirmed)/교사(teacher).
        if (!(await hasColumn(db, 'exams', 'status'))) {
          await db.run("ALTER TABLE exams ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'", []);
        }
        if (!(await hasColumn(db, 'exams', 'submitted_by'))) {
          await db.run("ALTER TABLE exams ADD COLUMN submitted_by TEXT NOT NULL DEFAULT 'teacher'", []);
        }
      },
    },
  ];

  let applied = current;
  for (const m of migrations) {
    if (m.to > applied) {
      await m.up(db);
      applied = m.to;
    }
  }

  const stamp = nowSeoulStamp();
  await db.run(
    "INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [String(Math.max(SCHEMA_VERSION, applied))]
  );
  await db.run(
    "INSERT INTO schema_meta(key, value) VALUES('migrated_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [stamp]
  );

  return { from: current, to: Math.max(SCHEMA_VERSION, applied) };
}
