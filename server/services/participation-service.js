// 수업 참여 리모콘 서비스 (요구사항 11절).
import { getDb, transaction } from '../db/connection.js';
import { nowSeoulStamp } from '../lib/time.js';
import { getEffectiveRules } from './rules-service.js';
import { addLedgerEntry, removeLedgerById } from './ledger-service.js';
import { requireDate, requireEnum, NotFoundError } from '../lib/validation.js';

const MAX_STACK = 3;

/** 특정 분반/수업일의 학생별 참여 현황 */
export function getParticipation(teacherId, className, lessonDate) {
  const db = getDb();
  const students = db
    .prepare(
      'SELECT id, name, grade, school FROM students WHERE teacher_id = ? AND class_name = ? AND archived = 0 ORDER BY name'
    )
    .all(teacherId, className);
  return students.map((s) => {
    const p = db
      .prepare('SELECT stack, bonus_given FROM participation WHERE student_id = ? AND lesson_date = ?')
      .get(s.id, lessonDate);
    return { ...s, stack: p ? p.stack : 0, bonus_given: p ? p.bonus_given : 0 };
  });
}

/**
 * 참여 스택 조정. delta = +1 (참여) 또는 -1 (정정).
 * 3스택 도달 시 보너스 지급, 3->2 로 내려가면 보너스 회수.
 */
export function adjustParticipation(studentId, body) {
  return transaction((db) => {
    const student = db.prepare('SELECT teacher_id FROM students WHERE id = ?').get(studentId);
    if (!student) throw new NotFoundError('학생을 찾을 수 없습니다.');
    const lessonDate = requireDate(body.lesson_date, '수업일');
    const delta = requireEnum(String(body.delta), '조정 값', ['1', '-1']) === '1' ? 1 : -1;

    let row = db
      .prepare('SELECT * FROM participation WHERE student_id = ? AND lesson_date = ?')
      .get(studentId, lessonDate);
    if (!row) {
      db.prepare(
        'INSERT INTO participation (student_id, lesson_date, stack, bonus_given, updated_at) VALUES (?,?,0,0,?)'
      ).run(studentId, lessonDate, nowSeoulStamp());
      row = db.prepare('SELECT * FROM participation WHERE student_id = ? AND lesson_date = ?').get(studentId, lessonDate);
    }

    let newStack = row.stack + delta;
    if (newStack < 0) newStack = 0;
    // 상한 없음(4회 이상 가능하나 보너스는 없음). 요구사항상 최대 3회까지만 기록하도록 제한.
    if (newStack > MAX_STACK) newStack = MAX_STACK;

    let bonusGiven = row.bonus_given;
    let ledgerId = row.ledger_id;
    const rules = getEffectiveRules(db, student.teacher_id, studentId);

    // 3스택 도달: 보너스 지급 (대기 CP)
    if (newStack >= MAX_STACK && !bonusGiven) {
      ledgerId = addLedgerEntry(db, {
        studentId,
        amount: rules.participation_stack3_cp,
        reason: `수업 참여 3회 달성 (${lessonDate})`,
        occurredDate: lessonDate,
        sourceType: 'participation',
        sourceId: null,
      });
      bonusGiven = 1;
    }
    // 3->2 로 하락: 보너스 회수
    if (newStack < MAX_STACK && bonusGiven) {
      if (ledgerId) removeLedgerById(db, ledgerId);
      ledgerId = null;
      bonusGiven = 0;
    }

    db.prepare(
      'UPDATE participation SET stack = ?, bonus_given = ?, ledger_id = ?, updated_at = ? WHERE student_id = ? AND lesson_date = ?'
    ).run(newStack, bonusGiven, ledgerId, nowSeoulStamp(), studentId, lessonDate);

    return { student_id: studentId, lesson_date: lessonDate, stack: newStack, bonus_given: bonusGiven };
  });
}
