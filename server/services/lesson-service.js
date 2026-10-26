// 수업/출결/단어시험 기록 서비스. CP 재계산 트랜잭션 포함.
import { getDb, transaction } from '../db/connection.js';
import { nowSeoulStamp } from '../lib/time.js';
import { computeLessonLedgerEntries, countToScore } from '../lib/cp-engine.js';
import { getEffectiveRules } from './rules-service.js';
import { addLedgerEntry, removeLedgerBySource } from './ledger-service.js';
import {
  requireDate,
  requireEnum,
  optString,
  optInt,
  toBool01,
  requireString,
  NotFoundError,
  ValidationError,
} from '../lib/validation.js';

const ATTENDANCE = ['present', 'late', 'absent'];
const WORD_STATUS = ['none', 'taken', 'noshow', 'etc'];

export async function listLessons(studentId, limit = 300) {
  const db = getDb();
  return db.all(
    'SELECT * FROM lessons WHERE student_id = ? ORDER BY lesson_date DESC, id DESC LIMIT ?',
    [studentId, limit]
  );
}

async function parseLessonBody(db, studentId, body, existing = {}) {
  const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!student) throw new NotFoundError('학생을 찾을 수 없습니다.');

  const attendance = body.attendance !== undefined
    ? requireEnum(body.attendance, '출결 상태', ATTENDANCE)
    : existing.attendance || 'present';

  const wordStatus = body.word_status !== undefined
    ? requireEnum(body.word_status, '단어시험 상태', WORD_STATUS)
    : existing.word_status || 'none';

  let wordEtcReason = body.word_etc_reason !== undefined
    ? optString(body.word_etc_reason, '기타 사유', { max: 300 })
    : existing.word_etc_reason;
  if (wordStatus === 'etc' && (!wordEtcReason || wordEtcReason.trim() === '')) {
    throw new ValidationError("단어시험 상태가 '기타'이면 사유를 반드시 입력해야 합니다.");
  }

  // 단어 점수 계산 (개수제면 환산)
  const mode = student.word_input_mode; // 'count' | 'score'
  let wordSeen = body.word_seen !== undefined ? optInt(body.word_seen, '본 단어 수', { min: 0, max: 100000 }) : existing.word_seen;
  let wordWrong = body.word_wrong !== undefined ? optInt(body.word_wrong, '틀린 단어 수', { min: 0, max: 100000 }) : existing.word_wrong;
  let wordScore = body.word_score !== undefined ? optInt(body.word_score, '점수', { min: 0, max: 100 }) : existing.word_score;

  if (wordStatus === 'taken') {
    if (mode === 'count') {
      if (wordSeen === null || wordSeen === undefined) {
        throw new ValidationError('개수제에서는 본 단어 수를 입력해야 합니다.');
      }
      if (wordWrong === null || wordWrong === undefined) wordWrong = 0;
      if (wordWrong > wordSeen) throw new ValidationError('틀린 단어 수가 본 단어 수보다 많을 수 없습니다.');
      wordScore = countToScore(wordSeen, wordWrong);
    } else {
      if (wordScore === null || wordScore === undefined) {
        throw new ValidationError('점수제에서는 0~100 점수를 입력해야 합니다.');
      }
    }
  }

  return {
    student_id: studentId,
    lesson_date: body.lesson_date !== undefined ? requireDate(body.lesson_date, '수업일') : existing.lesson_date,
    attendance,
    late_minutes: body.late_minutes !== undefined ? (optInt(body.late_minutes, '지각 시간', { min: 0, max: 600 }) || 0) : (existing.late_minutes || 0),
    word_status: wordStatus,
    word_etc_reason: wordEtcReason,
    word_range: body.word_range !== undefined ? optString(body.word_range, '단어시험 범위', { max: 200 }) : existing.word_range,
    word_seen: wordSeen ?? null,
    word_wrong: wordWrong ?? null,
    word_score: wordScore ?? null,
    deadline_met: body.deadline_met !== undefined ? toBool01(body.deadline_met) : (existing.deadline_met ?? 1),
    progress_today: body.progress_today !== undefined ? optString(body.progress_today, '진도', { max: 1000 }) : existing.progress_today,
    next_direction: body.next_direction !== undefined ? optString(body.next_direction, '다음 수업 방향', { max: 1000 }) : existing.next_direction,
    weakness: body.weakness !== undefined ? optString(body.weakness, '약점', { max: 1000 }) : existing.weakness,
    homework: body.homework !== undefined ? optString(body.homework, '숙제', { max: 1000 }) : existing.homework,
    progress_rate: body.progress_rate !== undefined ? optInt(body.progress_rate, '진도율', { min: 0, max: 100 }) : existing.progress_rate,
    attendance_only: body.attendance_only !== undefined ? toBool01(body.attendance_only) : (existing.attendance_only || 0),
  };
}

/** 수업 기록의 CP 장부를 재생성 (기존 효과 제거 후 재계산) */
async function recomputeLessonLedger(db, lesson) {
  await removeLedgerBySource(db, 'lesson', lesson.id);
  const rules = await getEffectiveRules(db, lesson.teacher_id, lesson.student_id);
  const entries = computeLessonLedgerEntries(rules, lesson);
  for (const e of entries) {
    await addLedgerEntry(db, {
      studentId: lesson.student_id,
      amount: e.amount,
      reason: e.reason,
      occurredDate: lesson.lesson_date,
      sourceType: 'lesson',
      sourceId: lesson.id,
    });
  }
}

export async function createLesson(studentId, body) {
  return transaction(async (db) => {
    const d = await parseLessonBody(db, studentId, body);
    const student = await db.get('SELECT teacher_id FROM students WHERE id = ?', [studentId]);
    const stamp = nowSeoulStamp();
    const info = await db.run(
      `INSERT INTO lessons
          (student_id, lesson_date, attendance, late_minutes, word_status, word_etc_reason, word_range,
           word_seen, word_wrong, word_score, deadline_met, progress_today, next_direction, weakness,
           homework, progress_rate, attendance_only, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.student_id, d.lesson_date, d.attendance, d.late_minutes, d.word_status, d.word_etc_reason,
        d.word_range, d.word_seen, d.word_wrong, d.word_score, d.deadline_met, d.progress_today,
        d.next_direction, d.weakness, d.homework, d.progress_rate, d.attendance_only, stamp, stamp,
      ]
    );
    const id = Number(info.lastInsertRowid);
    await recomputeLessonLedger(db, { ...d, id, teacher_id: student.teacher_id });
    return db.get('SELECT * FROM lessons WHERE id = ?', [id]);
  });
}

export async function updateLesson(id, body) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM lessons WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('수업 기록을 찾을 수 없습니다.');
    const d = await parseLessonBody(db, existing.student_id, body, existing);
    const student = await db.get('SELECT teacher_id FROM students WHERE id = ?', [existing.student_id]);
    await db.run(
      `UPDATE lessons SET
        lesson_date=?, attendance=?, late_minutes=?, word_status=?, word_etc_reason=?, word_range=?,
        word_seen=?, word_wrong=?, word_score=?, deadline_met=?, progress_today=?, next_direction=?,
        weakness=?, homework=?, progress_rate=?, attendance_only=?, updated_at=?
       WHERE id=?`,
      [
        d.lesson_date, d.attendance, d.late_minutes, d.word_status, d.word_etc_reason, d.word_range,
        d.word_seen, d.word_wrong, d.word_score, d.deadline_met, d.progress_today, d.next_direction,
        d.weakness, d.homework, d.progress_rate, d.attendance_only, nowSeoulStamp(), id,
      ]
    );
    // 기존 CP 효과 되돌리고 새 값으로 재계산
    await recomputeLessonLedger(db, { ...d, id, teacher_id: student.teacher_id });
    return db.get('SELECT * FROM lessons WHERE id = ?', [id]);
  });
}

export async function deleteLesson(id) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM lessons WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('수업 기록을 찾을 수 없습니다.');
    await removeLedgerBySource(db, 'lesson', id); // CP 효과 되돌리기
    await db.run('DELETE FROM lessons WHERE id = ?', [id]);
    return { deleted: true };
  });
}
