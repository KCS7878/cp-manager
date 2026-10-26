// 강사/학생 CP 규칙 서비스.
import { getDb, transaction } from '../db/connection.js';
import { mergeRules, DEFAULT_RULES } from '../lib/cp-engine.js';
import { nowSeoulStamp } from '../lib/time.js';
import { requireInt, toBool01 } from '../lib/validation.js';

const RULE_NUMERIC_FIELDS = [
  'word_pass_score',
  'pass_in_time_cp',
  'perfect_bonus_cp',
  'pass_late_cp',
  'no_show_cp',
  'late_grace_min',
  'late_penalty_per_min',
  'monthly_no_late_bonus',
  'monthly_word_bonus',
  'participation_stack3_cp',
];

const RULE_TOGGLE_FIELDS = ['show_quarter_title', 'show_perfect_attend', 'show_day_streak'];

/** 강사 규칙 조회 (없으면 기본값으로 생성) */
export function getTeacherRules(db, teacherId) {
  let row = db.prepare('SELECT * FROM cp_rules WHERE teacher_id = ?').get(teacherId);
  if (!row) {
    db.prepare(
      `INSERT INTO cp_rules (teacher_id, updated_at) VALUES (?, ?)`
    ).run(teacherId, nowSeoulStamp());
    row = db.prepare('SELECT * FROM cp_rules WHERE teacher_id = ?').get(teacherId);
  }
  return row;
}

export function updateTeacherRules(teacherId, patch) {
  return transaction((db) => {
    getTeacherRules(db, teacherId); // ensure exists
    const sets = [];
    const vals = [];
    for (const f of RULE_NUMERIC_FIELDS) {
      if (patch[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(requireInt(patch[f], f));
      }
    }
    for (const f of RULE_TOGGLE_FIELDS) {
      if (patch[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(toBool01(patch[f]));
      }
    }
    if (sets.length) {
      sets.push('updated_at = ?');
      vals.push(nowSeoulStamp());
      vals.push(teacherId);
      db.prepare(`UPDATE cp_rules SET ${sets.join(', ')} WHERE teacher_id = ?`).run(...vals);
    }
    return db.prepare('SELECT * FROM cp_rules WHERE teacher_id = ?').get(teacherId);
  });
}

/** 학생 예외 규칙 조회 (없으면 null) */
export function getStudentOverride(db, studentId) {
  return db.prepare('SELECT * FROM student_cp_rules WHERE student_id = ?').get(studentId) || null;
}

export function updateStudentOverride(studentId, patch) {
  return transaction((db) => {
    const existing = getStudentOverride(db, studentId);
    const fields = RULE_NUMERIC_FIELDS.filter((f) => f !== 'participation_stack3_cp');
    if (!existing) {
      db.prepare(
        'INSERT INTO student_cp_rules (student_id, updated_at) VALUES (?, ?)'
      ).run(studentId, nowSeoulStamp());
    }
    const sets = [];
    const vals = [];
    for (const f of fields) {
      if (patch[f] !== undefined) {
        sets.push(`${f} = ?`);
        // null이면 override 제거
        vals.push(patch[f] === null || patch[f] === '' ? null : requireInt(patch[f], f));
      }
    }
    if (sets.length) {
      sets.push('updated_at = ?');
      vals.push(nowSeoulStamp());
      vals.push(studentId);
      db.prepare(`UPDATE student_cp_rules SET ${sets.join(', ')} WHERE student_id = ?`).run(...vals);
    }
    return getStudentOverride(db, studentId);
  });
}

/**
 * 학생에게 적용되는 effective 규칙(강사+예외 병합).
 */
export function getEffectiveRules(db, teacherId, studentId) {
  const teacherRules = { ...DEFAULT_RULES, ...getTeacherRules(db, teacherId) };
  const override = studentId ? getStudentOverride(db, studentId) : null;
  return mergeRules(teacherRules, override);
}
