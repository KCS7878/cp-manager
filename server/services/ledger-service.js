// CP 장부 서비스 (async). 모든 CP 증감의 단일 진입점.
import { getDb } from '../db/connection.js';
import { nowSeoulStamp, todaySeoul, availableDateFor, dateLte } from '../lib/time.js';

/**
 * 장부 항목 추가. status는 발생월에 따라 자동 결정(이번달=pending, 지난달 이전=available)
 * opts.immediate=true 이면 즉시 가용(수동 즉시지급).
 * @returns ledger row id
 */
export async function addLedgerEntry(db, {
  studentId,
  amount,
  reason,
  occurredDate,
  sourceType,
  sourceId = null,
  immediate = false,
}) {
  const today = todaySeoul();
  const availableDate = immediate ? today : availableDateFor(occurredDate);
  const status = dateLte(availableDate, today) ? 'available' : 'pending';
  const stamp = nowSeoulStamp();

  const info = await db.run(
    `INSERT INTO cp_ledger
      (student_id, amount, reason, occurred_date, available_date, status, source_type, source_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [studentId, amount, reason, occurredDate, availableDate, status, sourceType, sourceId, stamp]
  );
  return Number(info.lastInsertRowid);
}

/** 특정 원본에 연결된 장부 항목 전부 삭제 (CP 효과 되돌리기) */
export async function removeLedgerBySource(db, sourceType, sourceId) {
  await db.run('DELETE FROM cp_ledger WHERE source_type = ? AND source_id = ?', [sourceType, sourceId]);
}

/** 특정 장부 id 삭제 */
export async function removeLedgerById(db, id) {
  await db.run('DELETE FROM cp_ledger WHERE id = ?', [id]);
}

/** 대기->가용 전환 */
export async function promotePendingToAvailable(db = getDb()) {
  const today = todaySeoul();
  await db.run(
    "UPDATE cp_ledger SET status = 'available' WHERE status = 'pending' AND available_date <= ?",
    [today]
  );
}

/** 학생 CP 잔액 요약 */
export async function getStudentBalance(db, studentId) {
  await promotePendingToAvailable(db);

  const availRow = await db.get(
    "SELECT COALESCE(SUM(amount),0) AS s FROM cp_ledger WHERE student_id = ? AND status = 'available'",
    [studentId]
  );
  const pendingRow = await db.get(
    "SELECT COALESCE(SUM(amount),0) AS s FROM cp_ledger WHERE student_id = ? AND status = 'pending'",
    [studentId]
  );
  const totalRow = await db.get(
    "SELECT COALESCE(SUM(amount),0) AS s FROM cp_ledger WHERE student_id = ? AND source_type != 'purchase'",
    [studentId]
  );
  return {
    available: availRow.s,
    pending: pendingRow.s,
    cumulative: totalRow.s,
  };
}

/** 학생 장부 내역 (최신순) */
export async function getLedger(db, studentId, limit = 500) {
  return db.all(
    'SELECT * FROM cp_ledger WHERE student_id = ? ORDER BY occurred_date DESC, id DESC LIMIT ?',
    [studentId, limit]
  );
}
