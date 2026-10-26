// 랭킹 서비스 (요구사항 12절).
import { getDb, transaction } from '../db/connection.js';
import {
  currentMonthKey,
  monthRange,
  prevMonthKey,
  currentQuarterKey,
  prevQuarterKey,
  quarterRange,
  nowSeoulStamp,
} from '../lib/time.js';
import { getTeacherRules } from './rules-service.js';
import { NotFoundError } from '../lib/validation.js';

const QUARTER_TITLES = ['King of English', 'Queen of English', 'Jack of English'];

/** 누적 CP (구매 제외 전체) */
function cumulativeCp(db, studentId) {
  return db
    .prepare("SELECT COALESCE(SUM(amount),0) s FROM cp_ledger WHERE student_id = ? AND source_type != 'purchase'")
    .get(studentId).s;
}

/** 이번 달 획득 CP (구매 제외, occurred_date가 이번 달) */
function monthlyCp(db, studentId, monthKey) {
  const { start, end } = monthRange(monthKey);
  return db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) s FROM cp_ledger WHERE student_id = ? AND source_type != 'purchase' AND occurred_date BETWEEN ? AND ?"
    )
    .get(studentId, start, end).s;
}

/** 지난달 개근상 조건 평가 */
function perfectAttendanceLastMonth(db, studentId) {
  const mk = prevMonthKey(currentMonthKey());
  const { start, end } = monthRange(mk);
  const lessons = db
    .prepare('SELECT * FROM lessons WHERE student_id = ? AND lesson_date BETWEEN ? AND ?')
    .all(studentId, start, end);
  if (lessons.length === 0) return false;
  const noNoShow = !lessons.some((l) => l.word_status === 'noshow');
  const noLateDeadline = !lessons.some((l) => l.word_status === 'taken' && !l.deadline_met);
  const noLate = !lessons.some((l) => l.attendance === 'late');
  const noAbsent = !lessons.some((l) => l.attendance === 'absent');
  return noNoShow && noLateDeadline && noLate && noAbsent;
}

/** 단어시험 DAY STREAK (최근 연속 기한 내 응시) */
function dayStreak(db, studentId) {
  const lessons = db
    .prepare("SELECT word_status, deadline_met FROM lessons WHERE student_id = ? ORDER BY lesson_date ASC, id ASC")
    .all(studentId);
  let streak = 0;
  for (const l of lessons) {
    if (l.word_status === 'taken' && l.deadline_met) streak += 1;
    else if (l.word_status === 'noshow') streak = 0;
    else if (l.word_status === 'taken' && !l.deadline_met) streak = 0;
    // none/etc: 변화 없음
  }
  return streak;
}

/** 전체 단어시험 만점 횟수 (PERFECT) */
function perfectCount(db, studentId) {
  return db
    .prepare("SELECT COUNT(*) c FROM lessons WHERE student_id = ? AND word_status = 'taken' AND word_score >= 100")
    .get(studentId).c;
}

/**
 * 랭킹 조회.
 * basis: 'cumulative' | 'monthly'
 * filter: { level, school, className, grade }
 */
export function getRanking(teacherId, { basis = 'cumulative', filter = {} } = {}) {
  const db = getDb();
  const rules = getTeacherRules(db, teacherId);
  const where = ['teacher_id = ?', 'archived = 0'];
  const params = [teacherId];
  if (filter.level) { where.push('school_level = ?'); params.push(filter.level); }
  if (filter.school) { where.push('school = ?'); params.push(filter.school); }
  if (filter.className) { where.push('class_name = ?'); params.push(filter.className); }
  if (filter.grade) { where.push('grade = ?'); params.push(filter.grade); }

  const students = db.prepare(`SELECT * FROM students WHERE ${where.join(' AND ')}`).all(...params);
  const mk = currentMonthKey();

  const quarterTitleMap = getQuarterTitleMap(db, teacherId);

  const rows = students.map((s) => {
    const cp = basis === 'monthly' ? monthlyCp(db, s.id, mk) : cumulativeCp(db, s.id);
    return {
      student_id: s.id,
      name: s.name,
      grade: s.grade,
      school: s.school,
      class_name: s.class_name,
      cp,
      symbols: {
        quarterTitle: rules.show_quarter_title ? quarterTitleMap[s.id] || null : null,
        perfectAttendance: rules.show_perfect_attend ? perfectAttendanceLastMonth(db, s.id) : false,
        dayStreak: rules.show_day_streak ? dayStreak(db, s.id) : null,
        perfectCount: perfectCount(db, s.id),
      },
    };
  });

  rows.sort((a, b) => b.cp - a.cp);
  rows.forEach((r, i) => (r.rank = i + 1));
  return {
    basis,
    monthKey: mk,
    toggles: {
      quarterTitle: !!rules.show_quarter_title,
      perfectAttendance: !!rules.show_perfect_attend,
      dayStreak: !!rules.show_day_streak,
    },
    rows,
  };
}

/** 현재 분기 확정된 칭호 맵 (student_id -> title) */
function getQuarterTitleMap(db, teacherId) {
  const q = currentQuarterKey();
  const titles = db
    .prepare('SELECT * FROM quarter_titles WHERE teacher_id = ? AND quarter_key = ?')
    .all(teacherId, q);
  const map = {};
  for (const t of titles) if (t.student_id) map[t.student_id] = t.title;
  return map;
}

/**
 * 분기 칭호 확정: 직전 분기 누적 CP 상위 3명을 현재 분기 칭호로 고정.
 * 이미 확정되어 있으면 건너뛴다 (불변).
 */
export function confirmQuarterTitles(teacherId, { force = false } = {}) {
  return transaction((db) => {
    const currentQ = currentQuarterKey();
    const existing = db
      .prepare('SELECT COUNT(*) c FROM quarter_titles WHERE teacher_id = ? AND quarter_key = ?')
      .get(teacherId, currentQ).c;
    if (existing > 0 && !force) {
      return { skipped: true, reason: '이미 확정된 분기입니다.' };
    }
    if (force) {
      db.prepare('DELETE FROM quarter_titles WHERE teacher_id = ? AND quarter_key = ?').run(teacherId, currentQ);
    }

    // 직전 분기 기간의 누적 CP (해당 기간 발생분 기준, 구매 제외)
    const prevQ = prevQuarterKey(currentQ);
    const { start, end } = quarterRange(prevQ);
    const students = db
      .prepare('SELECT id, name FROM students WHERE teacher_id = ? AND archived = 0')
      .all(teacherId);
    const scored = students.map((s) => {
      const cp = db
        .prepare(
          "SELECT COALESCE(SUM(amount),0) s FROM cp_ledger WHERE student_id = ? AND source_type != 'purchase' AND occurred_date BETWEEN ? AND ?"
        )
        .get(s.id, start, end).s;
      return { ...s, cp };
    });
    scored.sort((a, b) => b.cp - a.cp);
    const top3 = scored.slice(0, 3).filter((s) => s.cp > 0);

    const stamp = nowSeoulStamp();
    const confirmed = [];
    top3.forEach((s, i) => {
      db.prepare(
        `INSERT INTO quarter_titles (teacher_id, quarter_key, rank, student_id, student_name, title, confirmed_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(teacherId, currentQ, i + 1, s.id, s.name, QUARTER_TITLES[i], stamp);
      confirmed.push({ rank: i + 1, student: s.name, title: QUARTER_TITLES[i], cp: s.cp });
    });
    return { quarter: currentQ, basedOn: prevQ, confirmed };
  });
}

export function listQuarterTitles(teacherId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM quarter_titles WHERE teacher_id = ? ORDER BY quarter_key DESC, rank')
    .all(teacherId);
}
