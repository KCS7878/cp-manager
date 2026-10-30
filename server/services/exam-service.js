// 내신·모의고사 서비스 (요구사항 9절).
import { getDb, transaction } from '../db/connection.js';
import { nowSeoulStamp } from '../lib/time.js';
import { defaultTypeForItem } from '../lib/exam-types.js';
import {
  requireDate,
  requireEnum,
  requireString,
  optString,
  optInt,
  NotFoundError,
  ValidationError,
} from '../lib/validation.js';

const EXAM_KINDS = ['school', 'mock'];

export async function listExams(studentId) {
  const db = getDb();
  const rows = await db.all(
    'SELECT * FROM exams WHERE student_id = ? ORDER BY exam_date DESC, id DESC',
    [studentId]
  );
  return rows.map((e) => ({ ...e, items: e.items_json ? JSON.parse(e.items_json) : null }));
}

function validateItems(items) {
  if (items === null || items === undefined) return null;
  if (typeof items !== 'object') throw new ValidationError('문항 결과 형식이 올바르지 않습니다.');
  const clean = {};
  for (let i = 1; i <= 45; i++) {
    const v = items[String(i)] ?? items[i];
    if (v === 'o' || v === 'x') clean[i] = v;
    // null/미입력은 저장하지 않음 (분석 제외)
  }
  return clean;
}

function parseExamBody(body, existing = {}) {
  const examType = body.exam_type !== undefined ? requireEnum(body.exam_type, '시험 종류', EXAM_KINDS) : existing.exam_type;
  let itemsJson = existing.items_json ?? null;
  if (body.items !== undefined) {
    const clean = validateItems(body.items);
    itemsJson = clean ? JSON.stringify(clean) : null;
  }
  return {
    exam_type: examType,
    exam_name: body.exam_name !== undefined ? requireString(body.exam_name, '시험명', { max: 100 }) : existing.exam_name,
    exam_date: body.exam_date !== undefined ? requireDate(body.exam_date, '시험일') : existing.exam_date,
    score: body.score !== undefined ? optInt(body.score, '점수', { min: 0, max: 100 }) : existing.score,
    grade: body.grade !== undefined ? optString(body.grade, '등급', { max: 10 }) : existing.grade,
    strengths: body.strengths !== undefined ? optString(body.strengths, '잘한 점', { max: 1000 }) : existing.strengths,
    weakness: body.weakness !== undefined ? optString(body.weakness, '약점', { max: 1000 }) : existing.weakness,
    feedback: body.feedback !== undefined ? optString(body.feedback, '피드백', { max: 2000 }) : existing.feedback,
    items_json: itemsJson,
  };
}

export async function createExam(studentId, body, meta = {}) {
  return transaction(async (db) => {
    const s = await db.get('SELECT id FROM students WHERE id = ?', [studentId]);
    if (!s) throw new NotFoundError('학생을 찾을 수 없습니다.');
    const d = parseExamBody(body);
    const status = meta.status === 'pending' ? 'pending' : 'confirmed';
    const submittedBy = meta.submittedBy === 'student' ? 'student' : 'teacher';
    const stamp = nowSeoulStamp();
    const info = await db.run(
      `INSERT INTO exams (student_id, exam_type, exam_name, exam_date, score, grade, strengths, weakness, feedback, items_json, status, submitted_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [studentId, d.exam_type, d.exam_name, d.exam_date, d.score, d.grade, d.strengths, d.weakness, d.feedback, d.items_json, status, submittedBy, stamp, stamp]
    );
    return db.get('SELECT * FROM exams WHERE id = ?', [Number(info.lastInsertRowid)]);
  });
}

/**
 * 학생이 직접 제출하는 시험 점수. 승인 전까지 status='pending' 으로 저장되어
 * 분석/목표 비교에는 반영되지 않는다. 선생님이 승인하면 confirmed 가 된다.
 * 학생 입력은 점수/등급 위주로 제한(문항 OMR·피드백 등은 받지 않음).
 */
export async function submitSelfExam(studentId, body) {
  const safeBody = {
    exam_type: body.exam_type,
    exam_name: body.exam_name,
    exam_date: body.exam_date,
    score: body.score,
    grade: body.grade,
  };
  return createExam(studentId, safeBody, { status: 'pending', submittedBy: 'student' });
}

/** 학생이 제출한 시험(pending)을 확정(confirmed)으로 승인 */
export async function confirmExam(id) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM exams WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('시험 기록을 찾을 수 없습니다.');
    await db.run('UPDATE exams SET status = ?, updated_at = ? WHERE id = ?', ['confirmed', nowSeoulStamp(), id]);
    return db.get('SELECT * FROM exams WHERE id = ?', [id]);
  });
}

/** 특정 학생의 제출 대기(pending) 시험 목록 */
export async function listPendingExams(studentId) {
  const db = getDb();
  const rows = await db.all(
    "SELECT * FROM exams WHERE student_id = ? AND status = 'pending' ORDER BY exam_date DESC, id DESC",
    [studentId]
  );
  return rows.map((e) => ({ ...e, items: e.items_json ? JSON.parse(e.items_json) : null }));
}

export async function updateExam(id, body) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM exams WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('시험 기록을 찾을 수 없습니다.');
    const d = parseExamBody(body, existing);
    await db.run(
      `UPDATE exams SET exam_type=?, exam_name=?, exam_date=?, score=?, grade=?, strengths=?, weakness=?, feedback=?, items_json=?, updated_at=? WHERE id=?`,
      [d.exam_type, d.exam_name, d.exam_date, d.score, d.grade, d.strengths, d.weakness, d.feedback, d.items_json, nowSeoulStamp(), id]
    );
    return db.get('SELECT * FROM exams WHERE id = ?', [id]);
  });
}

export async function deleteExam(id) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM exams WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('시험 기록을 찾을 수 없습니다.');
    await db.run('DELETE FROM exams WHERE id = ?', [id]);
    return { deleted: true };
  });
}

/**
 * 학생 시험 분석:
 * - 점수 추세 (내신/모의 분리)
 * - 목표와의 차이
 * - 유형별 누적 정답률 (입력된 문항만)
 * - 반복 오답 유형
 */
export async function analyzeExams(studentId) {
  const db = getDb();
  const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!student) throw new NotFoundError('학생을 찾을 수 없습니다.');
  // 분석·목표 비교는 확정(confirmed)된 기록만 사용. 학생 제출(pending)은 제외.
  const exams = (await listExams(studentId)).filter((e) => (e.status || 'confirmed') === 'confirmed');

  const school = exams.filter((e) => e.exam_type === 'school').sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  const mock = exams.filter((e) => e.exam_type === 'mock').sort((a, b) => a.exam_date.localeCompare(b.exam_date));

  // 유형별 누적 정답률 (모의고사)
  const typeStats = {}; // type -> { correct, total }
  for (const e of mock) {
    if (!e.items) continue;
    for (const [numStr, val] of Object.entries(e.items)) {
      const type = defaultTypeForItem(numStr);
      if (!typeStats[type]) typeStats[type] = { correct: 0, total: 0 };
      typeStats[type].total += 1;
      if (val === 'o') typeStats[type].correct += 1;
    }
  }
  const typeAccuracy = Object.entries(typeStats)
    .map(([type, s]) => ({
      type,
      correct: s.correct,
      total: s.total,
      rate: s.total ? Math.round((s.correct / s.total) * 100) : null,
    }))
    .sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100));

  const weakTypes = typeAccuracy.filter((t) => t.rate !== null && t.rate < 60);

  return {
    schoolTrend: school.map((e) => ({ date: e.exam_date, name: e.exam_name, score: e.score, grade: e.grade })),
    mockTrend: mock.map((e) => ({ date: e.exam_date, name: e.exam_name, score: e.score, grade: e.grade })),
    goals: {
      mock: { type: student.mock_goal_type, value: student.mock_goal_value },
      school: { type: student.exam_goal_type, value: student.exam_goal_value },
    },
    typeAccuracy,
    weakTypes,
  };
}
