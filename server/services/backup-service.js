// 백업 및 복원 서비스 (요구사항 15절).
import { getDb, transaction } from '../db/connection.js';
import { nowSeoulStamp, todaySeoul } from '../lib/time.js';
import { ValidationError } from '../lib/validation.js';

// Node 환경 여부 (Workers에는 파일시스템이 없음)
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

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
export async function exportData(teacherId = null) {
  const db = getDb();
  const data = { meta: { exported_at: nowSeoulStamp(), version: 1, teacher_id: teacherId }, tables: {} };

  if (teacherId) {
    // 강사 범위 내보내기: 강사 + 해당 학생들 기준으로 필터
    const studentRows = await db.all('SELECT id FROM students WHERE teacher_id = ?', [teacherId]);
    const studentIds = studentRows.map((r) => r.id);
    const inStudents = studentIds.length ? `(${studentIds.join(',')})` : '(NULL)';

    data.tables.teachers = await db.all('SELECT * FROM teachers WHERE id = ?', [teacherId]);
    data.tables.schools = await db.all('SELECT * FROM schools WHERE teacher_id = ?', [teacherId]);
    data.tables.students = await db.all('SELECT * FROM students WHERE teacher_id = ?', [teacherId]);
    data.tables.cp_rules = await db.all('SELECT * FROM cp_rules WHERE teacher_id = ?', [teacherId]);
    data.tables.products = await db.all('SELECT * FROM products WHERE teacher_id = ?', [teacherId]);
    data.tables.quarter_titles = await db.all('SELECT * FROM quarter_titles WHERE teacher_id = ?', [teacherId]);
    data.tables.guides = await db.all('SELECT * FROM guides WHERE teacher_id = ?', [teacherId]);
    for (const t of ['student_cp_rules', 'lessons', 'exams', 'cp_ledger', 'monthly_bonuses', 'participation', 'purchases']) {
      data.tables[t] = await db.all(`SELECT * FROM ${t} WHERE student_id IN ${inStudents}`, []);
    }
    const productIds = data.tables.products.map((p) => p.id);
    const inProducts = productIds.length ? `(${productIds.join(',')})` : '(NULL)';
    data.tables.student_product_prices = await db.all(
      `SELECT * FROM student_product_prices WHERE student_id IN ${inStudents} OR product_id IN ${inProducts}`,
      []
    );
  } else {
    for (const t of TABLES) {
      data.tables[t] = await db.all(`SELECT * FROM ${t}`, []);
    }
  }
  return data;
}

/** 현재 DB를 파일로 자동 백업 */
export async function autoBackupToFile(teacherId = null, kind = 'auto_before_import') {
  const data = await exportData(teacherId);
  const stamp = nowSeoulStamp().replace(/[: ]/g, '-');
  const filename = `backup-${teacherId || 'all'}-${stamp}.json`;

  if (isNode) {
    // 로컬: backups/ 디렉터리에 JSON 파일로 저장
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf8');
  }
  // Workers: 파일 저장 생략(복원 전 백업 레코드만 남김). 사용자는 수동 내보내기로 백업 가능.

  const db = getDb();
  await db.run('INSERT INTO backups (teacher_id, kind, filename, created_at) VALUES (?,?,?,?)', [
    teacherId, kind, filename, nowSeoulStamp(),
  ]);
  return filename;
}

/**
 * JSON 데이터로 복원(덮어쓰기). 반드시 명시적 confirm 필요.
 * scope='all' 이면 전체, 아니면 teacher_id 범위만 교체.
 * 트랜잭션으로 처리하여 부분 적용 방지.
 */
export async function importData(payload, { confirm = false, scope = 'all', teacherId = null } = {}) {
  if (!confirm) {
    throw new ValidationError('복원은 명시적 확인(confirm=true)이 필요합니다.');
  }
  if (!payload || typeof payload !== 'object' || !payload.tables) {
    throw new ValidationError('유효하지 않은 백업 파일입니다. tables 필드가 없습니다.');
  }
  // 복원 전 자동 백업
  const backupFile = await autoBackupToFile(scope === 'teacher' ? teacherId : null, 'auto_before_import');

  await transaction(async (db) => {
    await db.exec('PRAGMA foreign_keys = OFF;');
    try {
      if (scope === 'all') {
        for (const t of [...TABLES].reverse()) await db.run(`DELETE FROM ${t}`, []);
        for (const t of TABLES) await insertRows(db, t, payload.tables[t]);
      } else {
        if (!teacherId) throw new ValidationError('강사 범위 복원에는 teacher_id가 필요합니다.');
        // 해당 강사 데이터 삭제 후 삽입
        await db.run('DELETE FROM teachers WHERE id = ?', [teacherId]); // CASCADE
        for (const t of TABLES) await insertRows(db, t, payload.tables[t]);
      }
    } finally {
      await db.exec('PRAGMA foreign_keys = ON;');
    }
  });

  return { restored: true, backupFile };
}

async function insertRows(db, table, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => '?').join(',');
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
  for (const row of rows) {
    await db.run(sql, cols.map((c) => row[c]));
  }
}

/** 웹 vs PC 데이터 비교 요약 (어느 쪽을 기준으로 할지 사용자가 선택하도록 정보 제공) */
export async function compareData(payload, teacherId = null) {
  const current = await exportData(teacherId);
  const summary = {};
  for (const t of TABLES) {
    const web = (current.tables[t] || []).length;
    const pc = (payload.tables?.[t] || []).length;
    summary[t] = { web, pc, diff: pc - web };
  }
  return { summary, identical: Object.values(summary).every((s) => s.diff === 0) };
}

export async function listBackups() {
  const db = getDb();
  return db.all('SELECT * FROM backups ORDER BY id DESC LIMIT 50', []);
}

// ── 학생 단위 외부 데이터화 ──

/** 한 학생의 모든 데이터를 사람이 읽기 쉬운 JSON으로 묶어 반환 */
export async function exportStudent(studentId) {
  const db = getDb();
  const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!student) throw new ValidationError('학생을 찾을 수 없습니다.');
  const teacher = await db.get('SELECT name FROM teachers WHERE id = ?', [student.teacher_id]);
  const pick = (sql) => db.all(sql, [studentId]);
  return {
    meta: { exported_at: nowSeoulStamp(), type: 'single_student', version: 1 },
    teacher: teacher ? teacher.name : null,
    student,
    override: (await db.get('SELECT * FROM student_cp_rules WHERE student_id = ?', [studentId])) || null,
    lessons: await pick('SELECT * FROM lessons WHERE student_id = ? ORDER BY lesson_date'),
    exams: await pick('SELECT * FROM exams WHERE student_id = ? ORDER BY exam_date'),
    cp_ledger: await pick('SELECT * FROM cp_ledger WHERE student_id = ? ORDER BY occurred_date'),
    monthly_bonuses: await pick('SELECT * FROM monthly_bonuses WHERE student_id = ? ORDER BY month_key'),
    participation: await pick('SELECT * FROM participation WHERE student_id = ? ORDER BY lesson_date'),
    purchases: await pick('SELECT * FROM purchases WHERE student_id = ? ORDER BY purchased_at'),
  };
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * 강사의 학생 명단을 CSV 문자열로 반환 (CP 잔액 포함).
 * 엑셀에서 바로 열 수 있도록 UTF-8 BOM 포함.
 */
export async function exportStudentsCsv(teacherId) {
  const db = getDb();
  // 지연 import 회피: ledger 계산은 직접 수행
  const students = await db.all('SELECT * FROM students WHERE teacher_id = ? AND archived = 0 ORDER BY name', [teacherId]);
  const header = ['이름', '학교', '학년', '분반', '나이', '과목', '모의목표종류', '모의목표값', '내신목표종류', '내신목표값', '사용가능CP', '대기CP', '누적CP'];
  const lines = [header.map(csvEscape).join(',')];
  for (const s of students) {
    const availRow = await db.get("SELECT COALESCE(SUM(amount),0) v FROM cp_ledger WHERE student_id=? AND status='available'", [s.id]);
    const avail = availRow.v;
    const pendingRow = await db.get("SELECT COALESCE(SUM(amount),0) v FROM cp_ledger WHERE student_id=? AND status='pending'", [s.id]);
    const pending = pendingRow.v;
    const cumRow = await db.get("SELECT COALESCE(SUM(amount),0) v FROM cp_ledger WHERE student_id=? AND source_type!='purchase'", [s.id]);
    const cum = cumRow.v;
    lines.push([
      s.name, s.school, s.grade, s.class_name, s.age, s.subject,
      s.mock_goal_type, s.mock_goal_value, s.exam_goal_type, s.exam_goal_value,
      avail, pending, cum,
    ].map(csvEscape).join(','));
  }
  return '\uFEFF' + lines.join('\r\n'); // BOM + CRLF (엑셀 호환)
}
