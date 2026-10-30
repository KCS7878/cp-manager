// 상점 / 구매 / 인벤토리 서비스 (요구사항 13절).
import { getDb, transaction } from '../db/connection.js';
import { nowSeoulStamp, todaySeoul } from '../lib/time.js';
import { getStudentBalance, addLedgerEntry, removeLedgerById } from './ledger-service.js';
import {
  requireString,
  optString,
  requireInt,
  optInt,
  requireEnum,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../lib/validation.js';

// ---- 상품 ----
export async function listProducts(teacherId, { includeEnded = true } = {}) {
  const db = getDb();
  const sql = includeEnded
    ? 'SELECT * FROM products WHERE teacher_id = ? ORDER BY status, name'
    : "SELECT * FROM products WHERE teacher_id = ? AND status = 'active' ORDER BY name";
  return db.all(sql, [teacherId]);
}

export async function createProduct(teacherId, body) {
  return transaction(async (db) => {
    const name = requireString(body.name, '상품명', { max: 80 });
    const stamp = nowSeoulStamp();
    const info = await db.run(
      `INSERT INTO products (teacher_id, name, description, base_cp, price_krw, image_url, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        teacherId,
        name,
        optString(body.description, '설명', { max: 1000 }),
        requireInt(body.base_cp ?? 0, '기본 필요 CP', { min: 0 }),
        optInt(body.price_krw, '원화 가격', { min: 0 }),
        optString(body.image_url, '이미지', { max: 500 }),
        requireEnum(body.status || 'active', '판매 상태', ['active', 'ended']),
        stamp,
        stamp,
      ]
    );
    return db.get('SELECT * FROM products WHERE id = ?', [Number(info.lastInsertRowid)]);
  });
}

export async function updateProduct(id, body) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('상품을 찾을 수 없습니다.');
    const d = {
      name: body.name !== undefined ? requireString(body.name, '상품명', { max: 80 }) : existing.name,
      description: body.description !== undefined ? optString(body.description, '설명', { max: 1000 }) : existing.description,
      base_cp: body.base_cp !== undefined ? requireInt(body.base_cp, '기본 필요 CP', { min: 0 }) : existing.base_cp,
      price_krw: body.price_krw !== undefined ? optInt(body.price_krw, '원화 가격', { min: 0 }) : existing.price_krw,
      image_url: body.image_url !== undefined ? optString(body.image_url, '이미지', { max: 500 }) : existing.image_url,
      status: body.status !== undefined ? requireEnum(body.status, '판매 상태', ['active', 'ended']) : existing.status,
    };
    await db.run(
      'UPDATE products SET name=?, description=?, base_cp=?, price_krw=?, image_url=?, status=?, updated_at=? WHERE id=?',
      [d.name, d.description, d.base_cp, d.price_krw, d.image_url, d.status, nowSeoulStamp(), id]
    );
    return db.get('SELECT * FROM products WHERE id = ?', [id]);
  });
}

/** 상품 종료 */
export async function endProduct(id) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('상품을 찾을 수 없습니다.');
    await db.run("UPDATE products SET status = 'ended', updated_at = ? WHERE id = ?", [nowSeoulStamp(), id]);
    return db.get('SELECT * FROM products WHERE id = ?', [id]);
  });
}

// ---- 학생별 가격 ----
export async function setStudentPrice(studentId, productId, cpPrice) {
  return transaction(async (db) => {
    if (cpPrice === null || cpPrice === '' || cpPrice === undefined) {
      await db.run('DELETE FROM student_product_prices WHERE student_id = ? AND product_id = ?', [studentId, productId]);
      return { removed: true };
    }
    const price = requireInt(cpPrice, 'CP 가격', { min: 0 });
    await db.run(
      `INSERT INTO student_product_prices (student_id, product_id, cp_price) VALUES (?,?,?)
       ON CONFLICT(student_id, product_id) DO UPDATE SET cp_price = excluded.cp_price`,
      [studentId, productId, price]
    );
    return { student_id: studentId, product_id: productId, cp_price: price };
  });
}

/** 특정 학생에게 적용되는 상품 가격 (override 있으면 그 값) */
export async function getEffectivePrice(db, studentId, product) {
  const row = await db.get(
    'SELECT cp_price FROM student_product_prices WHERE student_id = ? AND product_id = ?',
    [studentId, product.id]
  );
  return row ? row.cp_price : product.base_cp;
}

/** 학생 관점 상품 목록 (적용 가격 포함) */
export async function listProductsForStudent(teacherId, studentId) {
  const db = getDb();
  const products = await listProducts(teacherId, { includeEnded: false });
  const result = [];
  for (const p of products) {
    result.push({ ...p, effective_cp: await getEffectivePrice(db, studentId, p) });
  }
  return result;
}

// ---- 구매 ----
export async function purchase(studentId, productId) {
  return transaction(async (db) => {
    const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
    if (!student) throw new NotFoundError('학생을 찾을 수 없습니다.');
    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) throw new NotFoundError('상품을 찾을 수 없습니다.');
    if (product.status !== 'active') throw new ConflictError('판매 종료된 상품입니다.');

    const price = await getEffectivePrice(db, studentId, product);
    const bal = await getStudentBalance(db, studentId);
    if (bal.available < price) {
      throw new ConflictError(`사용 가능 CP가 부족합니다. (보유 ${bal.available} / 필요 ${price})`);
    }

    const stamp = nowSeoulStamp();
    // 구매 차감은 즉시 가용 차감
    const ledgerId = await addLedgerEntry(db, {
      studentId,
      amount: -price,
      reason: `상품 구매: ${product.name}`,
      occurredDate: todaySeoul(),
      sourceType: 'purchase',
      sourceId: null,
      immediate: true,
    });
    const info = await db.run(
      `INSERT INTO purchases (student_id, product_id, product_name, cp_spent, purchased_at, inventory_state, ledger_id, status, created_at)
         VALUES (?,?,?,?,?,'owned',?, 'confirmed', ?)`,
      [studentId, productId, product.name, price, stamp, ledgerId, stamp]
    );
    // 장부 source_id를 purchase id로 갱신
    const purchaseId = Number(info.lastInsertRowid);
    await db.run('UPDATE cp_ledger SET source_id = ? WHERE id = ?', [purchaseId, ledgerId]);
    return db.get('SELECT * FROM purchases WHERE id = ?', [purchaseId]);
  });
}

/** 구매 취소 (환불) */
export async function refundPurchase(purchaseId) {
  return transaction(async (db) => {
    const p = await db.get('SELECT * FROM purchases WHERE id = ?', [purchaseId]);
    if (!p) throw new NotFoundError('구매 내역을 찾을 수 없습니다.');
    if (p.ledger_id) await removeLedgerById(db, p.ledger_id);
    await db.run('DELETE FROM purchases WHERE id = ?', [purchaseId]);
    return { refunded: true };
  });
}

/** 구매내역 (담당 학생 전체 또는 특정 학생) — 정식 구매(confirmed)만 */
export async function listPurchases(teacherId, studentId = null, limit = 200) {
  const db = getDb();
  if (studentId) {
    return db.all(
      "SELECT p.*, s.name AS student_name FROM purchases p JOIN students s ON s.id = p.student_id WHERE p.student_id = ? AND p.status = 'confirmed' ORDER BY p.purchased_at DESC LIMIT ?",
      [studentId, limit]
    );
  }
  return db.all(
    `SELECT p.*, s.name AS student_name FROM purchases p
       JOIN students s ON s.id = p.student_id
       WHERE s.teacher_id = ? AND p.status = 'confirmed' ORDER BY p.purchased_at DESC LIMIT ?`,
    [teacherId, limit]
  );
}

/** 인벤토리 (학생별) — 정식 구매(confirmed)만 */
export async function listInventory(studentId) {
  const db = getDb();
  return db.all(
    "SELECT * FROM purchases WHERE student_id = ? AND status = 'confirmed' ORDER BY purchased_at DESC",
    [studentId]
  );
}

// ---- 구매 희망 (학생 요청 → 강사 승인) ----

/** 학생이 특정 상품 구매를 희망(요청). CP는 차감하지 않고 요청만 기록. */
export async function requestPurchase(studentId, productId) {
  return transaction(async (db) => {
    const student = await db.get('SELECT * FROM students WHERE id = ?', [studentId]);
    if (!student) throw new NotFoundError('학생을 찾을 수 없습니다.');
    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) throw new NotFoundError('상품을 찾을 수 없습니다.');
    if (product.status !== 'active') throw new ConflictError('판매 종료된 상품입니다.');

    // 같은 상품에 대한 중복 희망 방지
    const dup = await db.get(
      "SELECT id FROM purchases WHERE student_id = ? AND product_id = ? AND status = 'requested'",
      [studentId, productId]
    );
    if (dup) throw new ConflictError('이미 이 상품의 구매를 희망하셨습니다. 선생님 확인을 기다려 주세요.');

    const price = await getEffectivePrice(db, studentId, product);
    const stamp = nowSeoulStamp();
    const info = await db.run(
      `INSERT INTO purchases (student_id, product_id, product_name, cp_spent, purchased_at, inventory_state, status, created_at)
         VALUES (?,?,?,?,?,'owned','requested',?)`,
      [studentId, productId, product.name, price, stamp, stamp]
    );
    return db.get('SELECT * FROM purchases WHERE id = ?', [Number(info.lastInsertRowid)]);
  });
}

/** 구매 희망(요청) 목록 — 특정 학생 또는 강사 전체 */
export async function listPurchaseRequests(teacherId, studentId = null) {
  const db = getDb();
  if (studentId) {
    return db.all(
      "SELECT * FROM purchases WHERE student_id = ? AND status = 'requested' ORDER BY purchased_at DESC",
      [studentId]
    );
  }
  return db.all(
    `SELECT p.*, s.name AS student_name FROM purchases p
       JOIN students s ON s.id = p.student_id
       WHERE s.teacher_id = ? AND p.status = 'requested' ORDER BY p.purchased_at DESC`,
    [teacherId]
  );
}

/** 구매 희망 승인 → 실제 구매 처리(CP 차감 + 보유). 요청 행은 제거하고 정식 구매를 생성. */
export async function approvePurchaseRequest(purchaseId) {
  const db = getDb();
  const req = await db.get("SELECT * FROM purchases WHERE id = ? AND status = 'requested'", [purchaseId]);
  if (!req) throw new NotFoundError('구매 희망 내역을 찾을 수 없습니다.');
  if (!req.product_id) throw new ConflictError('해당 상품이 삭제되어 승인할 수 없습니다. 거절 후 다시 안내해 주세요.');
  // 요청 행 제거 후, 기존 구매 로직으로 정식 구매(잔액 확인·CP 차감·보유 생성)
  await db.run('DELETE FROM purchases WHERE id = ?', [purchaseId]);
  return purchase(req.student_id, req.product_id);
}

/** 구매 희망 거절 → 요청 제거 */
export async function rejectPurchaseRequest(purchaseId) {
  return transaction(async (db) => {
    const req = await db.get("SELECT * FROM purchases WHERE id = ? AND status = 'requested'", [purchaseId]);
    if (!req) throw new NotFoundError('구매 희망 내역을 찾을 수 없습니다.');
    await db.run('DELETE FROM purchases WHERE id = ?', [purchaseId]);
    return { rejected: true };
  });
}

/** 상품 사용 처리 / 되돌리기 */
export async function setInventoryState(purchaseId, state) {
  return transaction(async (db) => {
    const p = await db.get('SELECT * FROM purchases WHERE id = ?', [purchaseId]);
    if (!p) throw new NotFoundError('구매 내역을 찾을 수 없습니다.');
    const st = requireEnum(state, '인벤토리 상태', ['owned', 'used']);
    const usedAt = st === 'used' ? todaySeoul() : null;
    await db.run('UPDATE purchases SET inventory_state = ?, used_at = ? WHERE id = ?', [st, usedAt, purchaseId]);
    return db.get('SELECT * FROM purchases WHERE id = ?', [purchaseId]);
  });
}
