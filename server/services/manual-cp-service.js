// 수동 CP 지급/차감 서비스.
import { transaction } from '../db/connection.js';
import { todaySeoul } from '../lib/time.js';
import { addLedgerEntry, removeLedgerById } from './ledger-service.js';
import { requireInt, requireString, toBool01, NotFoundError } from '../lib/validation.js';

export async function grantManualCp(studentId, body) {
  return transaction(async (db) => {
    const s = await db.get('SELECT id FROM students WHERE id = ?', [studentId]);
    if (!s) throw new NotFoundError('학생을 찾을 수 없습니다.');
    const amount = requireInt(body.amount, 'CP 금액');
    const reason = requireString(body.reason, '사유', { max: 300 });
    const immediate = toBool01(body.immediate) === 1; // 즉시 가용 여부
    const occurredDate = body.occurred_date || todaySeoul();
    const id = await addLedgerEntry(db, {
      studentId,
      amount,
      reason: `[수동] ${reason}`,
      occurredDate,
      sourceType: 'manual',
      sourceId: null,
      immediate,
    });
    return db.get('SELECT * FROM cp_ledger WHERE id = ?', [id]);
  });
}

export async function deleteManualCp(ledgerId) {
  return transaction(async (db) => {
    const row = await db.get('SELECT * FROM cp_ledger WHERE id = ?', [ledgerId]);
    if (!row) throw new NotFoundError('CP 장부 항목을 찾을 수 없습니다.');
    if (row.source_type !== 'manual') {
      throw new NotFoundError('수동 지급 항목만 이 방법으로 삭제할 수 있습니다.');
    }
    await removeLedgerById(db, ledgerId);
    return { deleted: true };
  });
}
