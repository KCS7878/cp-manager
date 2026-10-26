// 월간 보너스 서비스 (요구사항 8절).
import { getDb, transaction } from '../db/connection.js';
import { nowSeoulStamp, monthRange, firstDayOfNextMonth } from '../lib/time.js';
import { getEffectiveRules } from './rules-service.js';
import { addLedgerEntry, removeLedgerById } from './ledger-service.js';
import { requireInt, NotFoundError, ValidationError } from '../lib/validation.js';

/**
 * 한 학생의 특정 월 보너스를 계산한다 (조건 평가만; 저장은 별도).
 * - 무지각: 해당 월 지각/결석 기록 없음
 * - 단어 성실: 해당 월 단어시험 기록이 1개 이상이고, 미응시/기한초과가 없음
 */
export async function evaluateMonthlyBonus(db, teacherId, studentId, monthKey) {
  const { start, end } = monthRange(monthKey);
  const rules = await getEffectiveRules(db, teacherId, studentId);

  const lessons = await db.all(
    'SELECT * FROM lessons WHERE student_id = ? AND lesson_date BETWEEN ? AND ?',
    [studentId, start, end]
  );

  const hasLateOrAbsent = lessons.some(
    (l) => l.attendance === 'late' || l.attendance === 'absent'
  );
  const noLate = lessons.length > 0 && !hasLateOrAbsent;

  const wordLessons = lessons.filter((l) => l.word_status === 'taken' || l.word_status === 'noshow');
  const hasNoShow = lessons.some((l) => l.word_status === 'noshow');
  const hasLateDeadline = wordLessons.some((l) => l.word_status === 'taken' && !l.deadline_met);
  const wordDiligent = wordLessons.length > 0 && !hasNoShow && !hasLateDeadline;

  return {
    noLate,
    wordDiligent,
    noLateBonus: noLate ? rules.monthly_no_late_bonus : 0,
    wordBonus: wordDiligent ? rules.monthly_word_bonus : 0,
  };
}

/** 월간 보너스 자동 계산 후 저장 (장부 반영). 기존 보너스는 되돌린 뒤 재계산. */
export async function computeAndSaveMonthlyBonus(studentId, monthKey) {
  return transaction(async (db) => {
    const student = await db.get('SELECT teacher_id FROM students WHERE id = ?', [studentId]);
    if (!student) throw new NotFoundError('학생을 찾을 수 없습니다.');

    const evalResult = await evaluateMonthlyBonus(db, student.teacher_id, studentId, monthKey);

    // 기존 보너스 row + 장부 제거
    const existing = await db.get(
      'SELECT * FROM monthly_bonuses WHERE student_id = ? AND month_key = ?',
      [studentId, monthKey]
    );
    const manualAdjust = existing ? existing.manual_adjust : 0;
    if (existing && existing.ledger_id) await removeLedgerById(db, existing.ledger_id);

    const total = evalResult.noLateBonus + evalResult.wordBonus + manualAdjust;
    let ledgerId = null;
    if (total !== 0) {
      const parts = [];
      if (evalResult.noLateBonus) parts.push(`무지각 +${evalResult.noLateBonus}`);
      if (evalResult.wordBonus) parts.push(`단어성실 +${evalResult.wordBonus}`);
      if (manualAdjust) parts.push(`수동조정 ${manualAdjust > 0 ? '+' : ''}${manualAdjust}`);
      ledgerId = await addLedgerEntry(db, {
        studentId,
        amount: total,
        reason: `${monthKey} 월간 보너스 (${parts.join(', ')})`,
        occurredDate: firstDayOfNextMonth(monthKey), // 다음달 1일 발생
        sourceType: 'monthly_bonus',
        sourceId: null,
        immediate: true, // 완료된 월의 보너스이므로 즉시 가용 처리
      });
    }

    await db.run(
      `INSERT INTO monthly_bonuses (student_id, month_key, no_late_bonus, word_bonus, manual_adjust, ledger_id, computed_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(student_id, month_key) DO UPDATE SET
         no_late_bonus=excluded.no_late_bonus, word_bonus=excluded.word_bonus,
         manual_adjust=excluded.manual_adjust, ledger_id=excluded.ledger_id, computed_at=excluded.computed_at`,
      [studentId, monthKey, evalResult.noLateBonus, evalResult.wordBonus, manualAdjust, ledgerId, nowSeoulStamp()]
    );

    return db.get('SELECT * FROM monthly_bonuses WHERE student_id = ? AND month_key = ?', [studentId, monthKey]);
  });
}

/** 관리자 수동 조정 (금액 수정) */
export async function adjustMonthlyBonus(studentId, monthKey, manualAdjust) {
  return transaction(async (db) => {
    const existing = await db.get(
      'SELECT * FROM monthly_bonuses WHERE student_id = ? AND month_key = ?',
      [studentId, monthKey]
    );
    if (!existing) throw new NotFoundError('먼저 월간 보너스를 계산해야 합니다.');
    const adj = requireInt(manualAdjust, '수동 조정액');
    const student = await db.get('SELECT teacher_id FROM students WHERE id = ?', [studentId]);
    if (existing.ledger_id) await removeLedgerById(db, existing.ledger_id);

    const total = existing.no_late_bonus + existing.word_bonus + adj;
    let ledgerId = null;
    if (total !== 0) {
      ledgerId = await addLedgerEntry(db, {
        studentId,
        amount: total,
        reason: `${monthKey} 월간 보너스 (수동 조정 반영)`,
        occurredDate: firstDayOfNextMonth(monthKey),
        sourceType: 'monthly_bonus',
        sourceId: null,
        immediate: true,
      });
    }
    await db.run(
      'UPDATE monthly_bonuses SET manual_adjust = ?, ledger_id = ?, computed_at = ? WHERE student_id = ? AND month_key = ?',
      [adj, ledgerId, nowSeoulStamp(), studentId, monthKey]
    );
    return db.get('SELECT * FROM monthly_bonuses WHERE student_id = ? AND month_key = ?', [studentId, monthKey]);
  });
}

/** 보너스 제거 */
export async function removeMonthlyBonus(studentId, monthKey) {
  return transaction(async (db) => {
    const existing = await db.get(
      'SELECT * FROM monthly_bonuses WHERE student_id = ? AND month_key = ?',
      [studentId, monthKey]
    );
    if (!existing) throw new NotFoundError('보너스를 찾을 수 없습니다.');
    if (existing.ledger_id) await removeLedgerById(db, existing.ledger_id);
    await db.run('DELETE FROM monthly_bonuses WHERE student_id = ? AND month_key = ?', [studentId, monthKey]);
    return { deleted: true };
  });
}

export async function listMonthlyBonuses(studentId) {
  const db = getDb();
  return db.all(
    'SELECT * FROM monthly_bonuses WHERE student_id = ? ORDER BY month_key DESC',
    [studentId]
  );
}
