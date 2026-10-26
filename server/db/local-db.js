// 로컬 전용 node:sqlite 초기화. Cloudflare Workers에서는 이 파일이 import되지 않는다.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalAdapter } from './adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/cp-manager.db');

export function getDbPath() {
  return process.env.CP_DB_PATH || DEFAULT_DB_PATH;
}

export function createLocalSqliteAdapter() {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 5000;');
  return createLocalAdapter(sqlite);
}
