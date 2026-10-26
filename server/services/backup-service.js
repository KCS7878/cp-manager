// 백업 및 복원 서비스 (요구사항 15절).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, transaction } from '../db/connection.js';
import { nowSeoulStamp, todaySeoul } from '../lib/time.js';
import { ValidationError } from '../lib/validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../backups');

const TABLES = [
  'teachers',
  'schools',
  'students',
  'cp_rules',
  'student_cp_rules',
  'lessons',
  'exams',
  'cp_ledger',
  'monthly_bonuses',
  'participation',
  'products',
  'student_product_prices',
  'purchases',
  'quarter_titles',
  'guides',
];

/** 전체 또는 특정 강사 데이터를 JSON 객체로 내보낸다. */
export function exportData(teacherId = null) {
  const db = getDb();
  const data = { meta: { exported_at: nowSeoulStamp(), version: 1, teacher_id: teacherId }, tables: {} };

  if (teacherId) {
    // 강사 범위 내보내기: 강사 + 해당 학생들 기준으로 필터
    const studentIds = db
      .prepare('SELECT id FROM students WHERE teacher_id = ?')
      .all(teacherId)
      .map((r) => r.id);
    const inStudents = studentIds.length ? `(${studentIds.join(',')})` : '(NULL)';

    data.tables.teachers = db.prepare('SELECT * FROM teachers WHERE id = ?').all(teacherId);
    data.tables.schools = db.prepare('SELECT * FROM schools WHERE teacher_id = ?').all(teacherId);
    data.tables.students = db.prepare('SELECT * FROM students WHERE teacher_id = ?').all(teacherId);
    data.tables.cp_rules = db.prepare('SELECT * FROM cp_rules WHERE teacher_id = ?').all(teacherId);
    data.tables.products = db.prepare('SELECT * FROM products WHERE teacher_id = ?').all(teacherId);
    data.tables.quarter_titles = db.prepare('SELECT * FROM quarter_titles WHERE teacher_id = ?').all(teacherId);
    data.tables.guides = db.prepare('SELECT * FROM guides WHERE teacher_id = ?').all(teacherId);
    for (const t of ['student_cp_rules', 'lessons', 'exams', 'cp_ledger', 'monthly_bonuses', 'participation', 'purchases']) {
      data.tables[t] = db.prepare(`SELECT * FROM ${t} WHERE student_id IN ${inStudents}`).all();
    }
    const productIds = data.tables.products.map((p) => p.id);
    const inProducts = productIds.length ? `(${productIds.join(',')})` : '(NULL)';
    data.tables.student_product_prices = db
      .prepare(`SELECT * FROM student_product_prices WHERE student_id IN ${inStudents} OR product_id IN ${inProducts}`)
      .all();
  } else {
    for (const t of TABLES) {
      data.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
    }
  }
  return data;
}

/** 현재 DB를 파일로 자동 백업 */
export function autoBackupToFile(teacherId = null, kind = 'auto_before_import') {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const data = exportData(teacherId);
  const stamp = nowSeoulStamp().replace(/[: ]/g, '-');
  const filename = `backup-${teacherId || 'all'}-${stamp}.json`;
  fs.writeFileSync(path.join(BACKUP_DIR, filename), JSON.stringify(data, null, 2), 'utf8');
  const db = getDb();
  db.prepare('INSERT INTO backups (teacher_id, kind, filename, created_at) VALUES (?,?,?,?)').run(
    teacherId,
    kind,
    filename,
    nowSeoulStamp()
  );
  return filename;
}

/**
 * JSON 데이터로 복원(덮어쓰기). 반드시 명시적 confirm 필요.
 * scope='all' 이면 전체, 아니면 teacher_id 범위만 교체.
 * 트랜잭션으로 처리하여 부분 적용 방지.
 */
export function importData(payload, { confirm = false, scope = 'all', teacherId = null } = {}) {
  if (!confirm) {
    throw new ValidationError('복원은 명시적 확인(confirm=true)이 필요합니다.');
  }
  if (!payload || typeof payload !== 'object' || !payload.tables) {
    throw new ValidationError('유효하지 않은 백업 파일입니다. tables 필드가 없습니다.');
  }
  // 복원 전 자동 백업
  const backupFile = autoBackupToFile(scope === 'teacher' ? teacherId : null, 'auto_before_import');

  transaction((db) => {
    db.exec('PRAGMA foreign_keys = OFF;');
    try {
      if (scope === 'all') {
        for (const t of [...TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
        for (const t of TABLES) insertRows(db, t, payload.tables[t]);
      } else {
        if (!teacherId) throw new ValidationError('강사 범위 복원에는 teacher_id가 필요합니다.');
        // 해당 강사 데이터 삭제 후 삽입
        db.prepare('DELETE FROM teachers WHERE id = ?').run(teacherId); // CASCADE
        for (const t of TABLES) insertRows(db, t, payload.tables[t]);
      }
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  });

  return { restored: true, backupFile };
}

function insertRows(db, table, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => '?').join(',');
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`
  );
  for (const row of rows) {
    stmt.run(...cols.map((c) => row[c]));
  }
}

/** 웹 vs PC 데이터 비교 요약 (어느 쪽을 기준으로 할지 사용자가 선택하도록 정보 제공) */
export function compareData(payload, teacherId = null) {
  const current = exportData(teacherId);
  const summary = {};
  for (const t of TABLES) {
    const web = (current.tables[t] || []).length;
    const pc = (payload.tables?.[t] || []).length;
    summary[t] = { web, pc, diff: pc - web };
  }
  return { summary, identical: Object.values(summary).every((s) => s.diff === 0) };
}

export function listBackups() {
  const db = getDb();
  return db.prepare('SELECT * FROM backups ORDER BY id DESC LIMIT 50').all();
}
