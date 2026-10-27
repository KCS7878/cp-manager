// 학생 서비스.
import { getDb, transaction } from '../db/connection.js';
import { nowSeoulStamp } from '../lib/time.js';
import { uniqueCode } from '../db/migrate.js';
import { getStudentBalance } from './ledger-service.js';
import {
  requireString,
  optString,
  optInt,
  requireEnum,
  NotFoundError,
} from '../lib/validation.js';

const LEVELS = ['middle', 'high', 'etc'];
const GOAL_TYPES = ['grade', 'score', 'undecided'];
const WORD_MODES = ['count', 'score'];

/** 학생 목록 (요약 CP 포함). filters 적용. */
export async function listStudents(teacherId, filters = {}) {
  const db = getDb();
  const where = ['s.archived = 0'];
  const params = [];

  if (filters.scope === 'mine' && teacherId) {
    where.push('s.teacher_id = ?');
    params.push(teacherId);
  } else if (filters.teacherId) {
    where.push('s.teacher_id = ?');
    params.push(Number(filters.teacherId));
  }
  if (filters.school) {
    where.push('s.school = ?');
    params.push(filters.school);
  }
  if (filters.className) {
    where.push('s.class_name = ?');
    params.push(filters.className);
  }
  if (filters.level && LEVELS.includes(filters.level)) {
    where.push('s.school_level = ?');
    params.push(filters.level);
  }
  if (filters.grade) {
    where.push('s.grade = ?');
    params.push(filters.grade);
  }
  if (filters.name) {
    where.push('s.name LIKE ?');
    params.push(`%${filters.name}%`);
  }

  const rows = await db.all(
    `SELECT s.* FROM students s WHERE ${where.join(' AND ')} ORDER BY s.name`,
    [...params]
  );

  const withCp = [];
  for (const s of rows) {
    const bal = await getStudentBalance(db, s.id);
    withCp.push({ ...s, available_cp: bal.available, pending_cp: bal.pending, cumulative_cp: bal.cumulative });
  }

  // 정렬
  if (filters.sort === 'cp_asc') withCp.sort((a, b) => a.available_cp - b.available_cp);
  else if (filters.sort === 'cp_desc') withCp.sort((a, b) => b.available_cp - a.available_cp);
  else if (filters.sort === 'name') withCp.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return withCp;
}

export async function getStudent(id) {
  const db = getDb();
  const s = await db.get('SELECT * FROM students WHERE id = ?', [id]);
  if (!s) throw new NotFoundError('학생을 찾을 수 없습니다.');
  const bal = await getStudentBalance(db, id);
  return { ...s, available_cp: bal.available, pending_cp: bal.pending, cumulative_cp: bal.cumulative };
}

const nn = (v, fallback = null) => (v === undefined ? fallback : v); // undefined -> null/기본값

function parseStudentBody(body, existing = {}) {
  return {
    name: body.name !== undefined ? requireString(body.name, '학생명', { max: 40 }) : existing.name,
    teacher_id: body.teacher_id !== undefined ? Number(body.teacher_id) : existing.teacher_id,
    school: body.school !== undefined ? optString(body.school, '학교', { max: 60 }) : nn(existing.school),
    school_level:
      body.school_level !== undefined
        ? requireEnum(body.school_level || 'etc', '학교급', LEVELS)
        : existing.school_level || 'etc',
    grade: body.grade !== undefined ? optString(body.grade, '학년', { max: 10 }) : nn(existing.grade),
    class_name: body.class_name !== undefined ? optString(body.class_name, '분반명', { max: 40 }) : nn(existing.class_name),
    age: body.age !== undefined ? optInt(body.age, '나이', { min: 1, max: 120 }) : nn(existing.age),
    subject: body.subject !== undefined ? (optString(body.subject, '과목', { max: 30 }) || '영어') : (existing.subject || '영어'),
    mock_goal_type:
      body.mock_goal_type !== undefined
        ? requireEnum(body.mock_goal_type || 'undecided', '모의고사 목표 종류', GOAL_TYPES)
        : existing.mock_goal_type || 'undecided',
    mock_goal_value: body.mock_goal_value !== undefined ? optString(body.mock_goal_value, '모의고사 목표', { max: 30 }) : nn(existing.mock_goal_value),
    exam_goal_type:
      body.exam_goal_type !== undefined
        ? requireEnum(body.exam_goal_type || 'undecided', '내신 목표 종류', GOAL_TYPES)
        : existing.exam_goal_type || 'undecided',
    exam_goal_value: body.exam_goal_value !== undefined ? optString(body.exam_goal_value, '내신 목표', { max: 30 }) : nn(existing.exam_goal_value),
    word_input_mode:
      body.word_input_mode !== undefined
        ? requireEnum(body.word_input_mode || 'count', '단어 입력 방식', WORD_MODES)
        : existing.word_input_mode || 'count',
  };
}

export async function createStudent(body) {
  return transaction(async (db) => {
    const d = parseStudentBody(body);
    if (!d.teacher_id) throw new NotFoundError('담당 강사를 지정해 주세요.');
    const t = await db.get('SELECT id FROM teachers WHERE id = ?', [d.teacher_id]);
    if (!t) throw new NotFoundError('담당 강사를 찾을 수 없습니다.');
    const stamp = nowSeoulStamp();
    const code = await uniqueCode(db, 'S', 'students');
    const info = await db.run(
      `INSERT INTO students
          (teacher_id, name, school, school_level, grade, class_name, age, subject,
           mock_goal_type, mock_goal_value, exam_goal_type, exam_goal_value, word_input_mode,
           access_code, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.teacher_id, d.name, d.school, d.school_level, d.grade, d.class_name, d.age, d.subject,
        d.mock_goal_type, d.mock_goal_value, d.exam_goal_type, d.exam_goal_value, d.word_input_mode,
        code, stamp, stamp,
      ]
    );
    return await getStudent(Number(info.lastInsertRowid));
  });
}

export async function updateStudent(id, body) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('학생을 찾을 수 없습니다.');
    const d = parseStudentBody(body, existing);
    await db.run(
      `UPDATE students SET
        name=?, teacher_id=?, school=?, school_level=?, grade=?, class_name=?, age=?, subject=?,
        mock_goal_type=?, mock_goal_value=?, exam_goal_type=?, exam_goal_value=?, word_input_mode=?,
        updated_at=?
       WHERE id=?`,
      [
        d.name, d.teacher_id, d.school, d.school_level, d.grade, d.class_name, d.age, d.subject,
        d.mock_goal_type, d.mock_goal_value, d.exam_goal_type, d.exam_goal_value, d.word_input_mode,
        nowSeoulStamp(), id,
      ]
    );
    return await getStudent(id);
  });
}

/** 학생 삭제 전 연결 기록 개수 안내 */
export async function getStudentDeletionImpact(id) {
  const db = getDb();
  const s = await db.get('SELECT * FROM students WHERE id = ?', [id]);
  if (!s) throw new NotFoundError('학생을 찾을 수 없습니다.');
  const count = async (sql) => {
    const row = await db.get(sql, [id]);
    return row.c;
  };
  return {
    student: s.name,
    lessons: await count('SELECT COUNT(*) c FROM lessons WHERE student_id = ?'),
    exams: await count('SELECT COUNT(*) c FROM exams WHERE student_id = ?'),
    ledger: await count('SELECT COUNT(*) c FROM cp_ledger WHERE student_id = ?'),
    purchases: await count('SELECT COUNT(*) c FROM purchases WHERE student_id = ?'),
    participation: await count('SELECT COUNT(*) c FROM participation WHERE student_id = ?'),
  };
}

export async function deleteStudent(id) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('학생을 찾을 수 없습니다.');
    await db.run('DELETE FROM students WHERE id = ?', [id]); // CASCADE
    return { deleted: true };
  });
}

/** 강사의 분반 목록 */
export async function listClasses(teacherId) {
  const db = getDb();
  const rows = await db.all(
    "SELECT DISTINCT class_name FROM students WHERE teacher_id = ? AND class_name IS NOT NULL AND class_name != '' AND archived = 0 ORDER BY class_name",
    [teacherId]
  );
  return rows.map((r) => r.class_name);
}
