// node:sqlite 기반 단일 DB 연결 (싱글턴).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/cp-manager.db');

let dbInstance = null;
let dbPathUsed = null;

export function getDbPath() {
  return process.env.CP_DB_PATH || DEFAULT_DB_PATH;
}

// node:sqlite는 undefined 바인딩을 거부한다. prepare를 감싸 undefined -> null 정규화.
function wrapPrepare(db) {
  const origPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = origPrepare(sql);
    const origRun = stmt.run.bind(stmt);
    const origGet = stmt.get.bind(stmt);
    const origAll = stmt.all.bind(stmt);
    const norm = (args) =>
      args.map((a) => {
        if (a === undefined) return null;
        if (typeof a === 'boolean') return a ? 1 : 0;
        return a;
      });
    stmt.run = (...args) => origRun(...norm(args));
    stmt.get = (...args) => origGet(...norm(args));
    stmt.all = (...args) => origAll(...norm(args));
    return stmt;
  };
}

export function getDb() {
  if (dbInstance) return dbInstance;
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  dbInstance = new DatabaseSync(dbPath);
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA busy_timeout = 5000;');
  wrapPrepare(dbInstance);
  dbPathUsed = dbPath;
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPathUsed = null;
  }
}

/**
 * 트랜잭션 헬퍼. fn 안에서 던지면 전체 롤백된다.
 * node:sqlite는 중첩 BEGIN을 허용하지 않으므로 재진입 방지 처리를 둔다.
 */
let inTx = false;
export function transaction(fn) {
  const db = getDb();
  if (inTx) {
    // 이미 트랜잭션 안이면 그대로 실행 (savepoint 없이 동일 트랜잭션 공유)
    return fn(db);
  }
  db.exec('BEGIN');
  inTx = true;
  try {
    const result = fn(db);
    db.exec('COMMIT');
    inTx = false;
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    inTx = false;
    throw err;
  }
}
