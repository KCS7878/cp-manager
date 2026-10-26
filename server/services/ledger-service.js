// CP 장부 서비스. 모든 CP 증감의 단일 진입점.
import { getDb } from '../db/connection.js';
import { nowSeoulStamp, todaySeoul, availableDateFor, dateLte } from '../lib/time.js';

/**
 * 장부 항목 추가. status는 발생월에 따라 자동 결정(이번달=pending, 지난달 이전=available)
 * opts.immediate=true 이면 즉시 가용(수동 즉시지급).
 * 같은 트랜잭션 안에서 호출되어야 한다(상위 서비스가 transaction()으로 감쌈).
 * @returns ledger row id
 */
export function addLedgerEntry(db, {
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
  // 사용 가능일이 오늘 이하이면 available, 아니면 pending
  const status = dateLte(availableDate, today) ? 'available' : 'pending';
  const stamp = nowSeoulStamp();

  const info = db
    .prepare(
      `INSERT INTO cp_ledger
        (student_id, amount, reason, occurred_date, available_date, status, source_type, source_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(studentId, amount, reason, occurredDate, availableDate, status, sourceType, sourceId, stamp);
  return Number(info.lastInsertRowid);
}

/** 특정 원본(source_type, source_id)에 연결된 장부 항목 전부 삭제 (CP 효과 되돌리기) */
export function removeLedgerBySource(db, sourceType, sourceId) {
  db.prepare('DELETE FROM cp_ledger WHERE source_type = ? AND source_id = ?').run(
    sourceType,
    sourceId
  );
}

/** 특정 장부 id 삭제 */
export function removeLedgerById(db, id) {
  db.prepare('DELETE FROM cp_ledger WHERE id = ?').run(id);
}

/**
 * 대기->가용 전환: 사용 가능일이 오늘 이하인 pending 항목을 available로.
 * 앱 시작 시/요약 조회 시 호출.
 */
export function promotePendingToAvailable(db = getDb()) {
  const today = todaySeoul();
  db.prepare(
    "UPDATE cp_ledger SET status = 'available' WHERE status = 'pending' AND available_date <= ?"
  ).run(today);
}

/**
 * 학생 CP 잔액 요약 계산.
 * - available: 가용 상태 항목 합 - 구매로 사용한 CP
 * - pending: 대기 상태 항목 합 (구매는 항상 즉시 가용 차감이므로 pending엔 purchase 없음)
 * - total: 누적 CP (구매 제외한 모든 증감 합)
 */
export function getStudentBalance(db, studentId) {
  promotePendingToAvailable(db);

  const available = db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) AS s FROM cp_ledger WHERE student_id = ? AND status = 'available'"
    )
    .get(studentId).s;

  const pending = db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) AS s FROM cp_ledger WHERE student_id = ? AND status = 'pending'"
    )
    .get(studentId).s;

  // 누적(랭킹용): 구매 항목 제외한 모든 양/음수 합
  const totalEarned = db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) AS s FROM cp_ledger WHERE student_id = ? AND source_type != 'purchase'"
    )
    .get(studentId).s;

  return {
    available, // 사용 가능 CP (구매 차감 포함되어 반영됨)
    pending, // 대기 CP
    cumulative: totalEarned, // 누적 CP (구매 제외)
  };
}

/** 학생의 장부 내역 조회 (최신순) */
export function getLedger(db, studentId, limit = 500) {
  return db
    .prepare(
      'SELECT * FROM cp_ledger WHERE student_id = ? ORDER BY occurred_date DESC, id DESC LIMIT ?'
    )
    .all(studentId, limit);
}
