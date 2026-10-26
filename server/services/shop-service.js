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
export function listProducts(teacherId, { includeEnded = true } = {}) {
  const db = getDb();
  const sql = includeEnded
    ? 'SELECT * FROM products WHERE teacher_id = ? ORDER BY status, name'
    : "SELECT * FROM products WHERE teacher_id = ? AND status = 'active' ORDER BY name";
  return db.prepare(sql).all(teacherId);
}

export function createProduct(teacherId, body) {
  return transaction((db) => {
    const name = requireString(body.name, '상품명', { max: 80 });
    const stamp = nowSeoulStamp();
    const info = db
      .prepare(
        `INSERT INTO products (teacher_id, name, description, base_cp, price_krw, image_url, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        teacherId,
        name,
        optString(body.description, '설명', { max: 1000 }),
        requireInt(body.base_cp ?? 0, '기본 필요 CP', { min: 0 }),
        optInt(body.price_krw, '원화 가격', { min: 0 }),
        optString(body.image_url, '이미지', { max: 500 }),
        requireEnum(body.status || 'active', '판매 상태', ['active', 'ended']),
        stamp,
        stamp
      );
    return db.prepare('SELECT * FROM products WHERE id = ?').get(Number(info.lastInsertRowid));
  });
}

export function updateProduct(id, body) {
  return transaction((db) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) throw new NotFoundError('상품을 찾을 수 없습니다.');
    const d = {
      name: body.name !== undefined ? requireString(body.name, '상품명', { max: 80 }) : existing.name,
      description: body.description !== undefined ? optString(body.description, '설명', { max: 1000 }) : existing.description,
      base_cp: body.base_cp !== undefined ? requireInt(body.base_cp, '기본 필요 CP', { min: 0 }) : existing.base_cp,
      price_krw: body.price_krw !== undefined ? optInt(body.price_krw, '원화 가격', { min: 0 }) : existing.price_krw,
      image_url: body.image_url !== undefined ? optString(body.image_url, '이미지', { max: 500 }) : existing.image_url,
      status: body.status !== undefined ? requireEnum(body.status, '판매 상태', ['active', 'ended']) : existing.status,
    };
    db.prepare(
      'UPDATE products SET name=?, description=?, base_cp=?, price_krw=?, image_url=?, status=?, updated_at=? WHERE id=?'
    ).run(d.name, d.description, d.base_cp, d.price_krw, d.image_url, d.status, nowSeoulStamp(), id);
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  });
}

/** 상품 종료 */
export function endProduct(id) {
  return transaction((db) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) throw new NotFoundError('상품을 찾을 수 없습니다.');
    db.prepare("UPDATE products SET status = 'ended', updated_at = ? WHERE id = ?").run(nowSeoulStamp(), id);
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  });
}

// ---- 학생별 가격 ----
export function setStudentPrice(studentId, productId, cpPrice) {
  return transaction((db) => {
    if (cpPrice === null || cpPrice === '' || cpPrice === undefined) {
      db.prepare('DELETE FROM student_product_prices WHERE student_id = ? AND product_id = ?').run(studentId, productId);
      return { removed: true };
    }
    const price = requireInt(cpPrice, 'CP 가격', { min: 0 });
    db.prepare(
      `INSERT INTO student_product_prices (student_id, product_id, cp_price) VALUES (?,?,?)
       ON CONFLICT(student_id, product_id) DO UPDATE SET cp_price = excluded.cp_price`
    ).run(studentId, productId, price);
    return { student_id: studentId, product_id: productId, cp_price: price };
  });
}

/** 특정 학생에게 적용되는 상품 가격 (override 있으면 그 값) */
export function getEffectivePrice(db, studentId, product) {
  const row = db
    .prepare('SELECT cp_price FROM student_product_prices WHERE student_id = ? AND product_id = ?')
    .get(studentId, product.id);
  return row ? row.cp_price : product.base_cp;
}

/** 학생 관점 상품 목록 (적용 가격 포함) */
export function listProductsForStudent(teacherId, studentId) {
  const db = getDb();
  const products = listProducts(teacherId, { includeEnded: false });
  return products.map((p) => ({ ...p, effective_cp: getEffectivePrice(db, studentId, p) }));
}

// ---- 구매 ----
export function purchase(studentId, productId) {
  return transaction((db) => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!student) throw new NotFoundError('학생을 찾을 수 없습니다.');
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) throw new NotFoundError('상품을 찾을 수 없습니다.');
    if (product.status !== 'active') throw new ConflictError('판매 종료된 상품입니다.');

    const price = getEffectivePrice(db, studentId, product);
    const bal = getStudentBalance(db, studentId);
    if (bal.available < price) {
      throw new ConflictError(`사용 가능 CP가 부족합니다. (보유 ${bal.available} / 필요 ${price})`);
    }

    const stamp = nowSeoulStamp();
    // 구매 차감은 즉시 가용 차감
    const ledgerId = addLedgerEntry(db, {
      studentId,
      amount: -price,
      reason: `상품 구매: ${product.name}`,
      occurredDate: todaySeoul(),
      sourceType: 'purchase',
      sourceId: null,
      immediate: true,
    });
    const info = db
      .prepare(
        `INSERT INTO purchases (student_id, product_id, product_name, cp_spent, purchased_at, inventory_state, ledger_id, created_at)
         VALUES (?,?,?,?,?,'owned',?,?)`
      )
      .run(studentId, productId, product.name, price, stamp, ledgerId, stamp);
    // 장부 source_id를 purchase id로 갱신
    const purchaseId = Number(info.lastInsertRowid);
    db.prepare('UPDATE cp_ledger SET source_id = ? WHERE id = ?').run(purchaseId, ledgerId);
    return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  });
}

/** 구매 취소 (환불) */
export function refundPurchase(purchaseId) {
  return transaction((db) => {
    const p = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    if (!p) throw new NotFoundError('구매 내역을 찾을 수 없습니다.');
    if (p.ledger_id) removeLedgerById(db, p.ledger_id);
    db.prepare('DELETE FROM purchases WHERE id = ?').run(purchaseId);
    return { refunded: true };
  });
}

/** 구매내역 (담당 학생 전체 또는 특정 학생) */
export function listPurchases(teacherId, studentId = null, limit = 200) {
  const db = getDb();
  if (studentId) {
    return db
      .prepare('SELECT p.*, s.name AS student_name FROM purchases p JOIN students s ON s.id = p.student_id WHERE p.student_id = ? ORDER BY p.purchased_at DESC LIMIT ?')
      .all(studentId, limit);
  }
  return db
    .prepare(
      `SELECT p.*, s.name AS student_name FROM purchases p
       JOIN students s ON s.id = p.student_id
       WHERE s.teacher_id = ? ORDER BY p.purchased_at DESC LIMIT ?`
    )
    .all(teacherId, limit);
}

/** 인벤토리 (학생별) */
export function listInventory(studentId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM purchases WHERE student_id = ? ORDER BY purchased_at DESC')
    .all(studentId);
}

/** 상품 사용 처리 / 되돌리기 */
export function setInventoryState(purchaseId, state) {
  return transaction((db) => {
    const p = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    if (!p) throw new NotFoundError('구매 내역을 찾을 수 없습니다.');
    const st = requireEnum(state, '인벤토리 상태', ['owned', 'used']);
    const usedAt = st === 'used' ? todaySeoul() : null;
    db.prepare('UPDATE purchases SET inventory_state = ?, used_at = ? WHERE id = ?').run(st, usedAt, purchaseId);
    return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  });
}
