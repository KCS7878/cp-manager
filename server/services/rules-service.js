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
export async function getTeacherRules(db, teacherId) {
  let row = await db.get('SELECT * FROM cp_rules WHERE teacher_id = ?', [teacherId]);
  if (!row) {
    await db.run(
      `INSERT INTO cp_rules (teacher_id, updated_at) VALUES (?, ?)`,
      [teacherId, nowSeoulStamp()]
    );
    row = await db.get('SELECT * FROM cp_rules WHERE teacher_id = ?', [teacherId]);
  }
  return row;
}

export async function updateTeacherRules(teacherId, patch) {
  return transaction(async (db) => {
    await getTeacherRules(db, teacherId); // ensure exists
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
      await db.run(`UPDATE cp_rules SET ${sets.join(', ')} WHERE teacher_id = ?`, [...vals]);
    }
    return db.get('SELECT * FROM cp_rules WHERE teacher_id = ?', [teacherId]);
  });
}

/** 학생 예외 규칙 조회 (없으면 null) */
export async function getStudentOverride(db, studentId) {
  return (await db.get('SELECT * FROM student_cp_rules WHERE student_id = ?', [studentId])) || null;
}

export async function updateStudentOverride(studentId, patch) {
  return transaction(async (db) => {
    const existing = await getStudentOverride(db, studentId);
    const fields = RULE_NUMERIC_FIELDS.filter((f) => f !== 'participation_stack3_cp');
    if (!existing) {
      await db.run(
        'INSERT INTO student_cp_rules (student_id, updated_at) VALUES (?, ?)',
        [studentId, nowSeoulStamp()]
      );
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
      await db.run(`UPDATE student_cp_rules SET ${sets.join(', ')} WHERE student_id = ?`, [...vals]);
    }
    return getStudentOverride(db, studentId);
  });
}

/**
 * 학생에게 적용되는 effective 규칙(강사+예외 병합).
 */
export async function getEffectiveRules(db, teacherId, studentId) {
  const teacherRules = { ...DEFAULT_RULES, ...(await getTeacherRules(db, teacherId)) };
  const override = studentId ? await getStudentOverride(db, studentId) : null;
  return mergeRules(teacherRules, override);
}
