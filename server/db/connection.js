// DB 연결: 로컬(node:sqlite)과 Cloudflare D1을 async 어댑터로 통일.
//
// - 로컬: 시작 시 initLocalDb()로 node:sqlite 어댑터를 1회 생성(싱글턴).
// - Cloudflare: 요청마다 setD1Binding(env.DB)로 D1 어댑터 주입.
//
// getDb()는 활성 어댑터를 동기 반환. 모든 DB 접근은 await db.run/get/all/exec,
// await transaction(async (db) => { ... }).

import { createD1Adapter } from './adapter.js';

let localAdapter = null;  // 로컬 싱글턴
let d1Adapter = null;     // D1 요청 스코프

/** 로컬 node:sqlite 어댑터를 초기화 (로컬 서버 시작 시 1회 호출) */
export async function initLocalDb() {
  if (localAdapter) return localAdapter;
  const mod = await import('./local-db.js');
  localAdapter = mod.createLocalSqliteAdapter();
  return localAdapter;
}

/** Cloudflare Workers에서 요청 시작 시 D1 바인딩 주입 */
export function setD1Binding(d1) {
  d1Adapter = createD1Adapter(d1);
}
export function clearD1Binding() {
  d1Adapter = null;
}

/** 현재 활성 DB 어댑터 (D1 우선, 없으면 로컬 싱글턴) */
export function getDb() {
  if (d1Adapter) return d1Adapter;
  if (localAdapter) return localAdapter;
  throw new Error('DB가 초기화되지 않았습니다. 로컬은 initLocalDb(), Workers는 setD1Binding()을 먼저 호출하세요.');
}

export function getDbPathSafe() {
  return process.env.CP_DB_PATH || null;
}

export async function closeDb() {
  if (localAdapter && localAdapter._raw && typeof localAdapter._raw.close === 'function') {
    localAdapter._raw.close();
  }
  localAdapter = null;
}

/**
 * 트랜잭션 헬퍼 (async).
 * - 로컬: 어댑터 batch(fn)가 BEGIN/COMMIT으로 감싼다 (원자적).
 * - D1: 대화형 트랜잭션 미지원 → fn 순차 실행 (단일 사용자 환경에서 안전).
 * fn: async (db) => value. 재진입 시 같은 어댑터 공유(중첩 BEGIN 방지).
 */
let inTx = false;
export async function transaction(fn) {
  const db = getDb();
  if (inTx) return fn(db);
  inTx = true;
  try {
    return await db.batch(async () => fn(db));
  } finally {
    inTx = false;
  }
}
