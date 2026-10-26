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

export function listExams(studentId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM exams WHERE student_id = ? ORDER BY exam_date DESC, id DESC')
    .all(studentId)
    .map((e) => ({ ...e, items: e.items_json ? JSON.parse(e.items_json) : null }));
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

export function createExam(studentId, body) {
  return transaction((db) => {
    const s = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!s) throw new NotFoundError('학생을 찾을 수 없습니다.');
    const d = parseExamBody(body);
    const stamp = nowSeoulStamp();
    const info = db
      .prepare(
        `INSERT INTO exams (student_id, exam_type, exam_name, exam_date, score, grade, strengths, weakness, feedback, items_json, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(studentId, d.exam_type, d.exam_name, d.exam_date, d.score, d.grade, d.strengths, d.weakness, d.feedback, d.items_json, stamp, stamp);
    return db.prepare('SELECT * FROM exams WHERE id = ?').get(Number(info.lastInsertRowid));
  });
}

export function updateExam(id, body) {
  return transaction((db) => {
    const existing = db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
    if (!existing) throw new NotFoundError('시험 기록을 찾을 수 없습니다.');
    const d = parseExamBody(body, existing);
    db.prepare(
      `UPDATE exams SET exam_type=?, exam_name=?, exam_date=?, score=?, grade=?, strengths=?, weakness=?, feedback=?, items_json=?, updated_at=? WHERE id=?`
    ).run(d.exam_type, d.exam_name, d.exam_date, d.score, d.grade, d.strengths, d.weakness, d.feedback, d.items_json, nowSeoulStamp(), id);
    return db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
  });
}

export function deleteExam(id) {
  return transaction((db) => {
    const existing = db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
    if (!existing) throw new NotFoundError('시험 기록을 찾을 수 없습니다.');
    db.prepare('DELETE FROM exams WHERE id = ?').run(id);
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
export function analyzeExams(studentId) {
  const db = getDb();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) throw new NotFoundError('학생을 찾을 수 없습니다.');
  const exams = listExams(studentId);

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
