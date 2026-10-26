// 스키마 적용 및 마이그레이션 실행.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './connection.js';
import { nowSeoulStamp } from '../lib/time.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, './schema.sql');

export const SCHEMA_VERSION = 1;

/**
 * 스키마를 적용(IF NOT EXISTS 기반 idempotent)하고 버전을 기록한다.
 * 향후 버전 추가 시 migrations 배열에 단계별 SQL을 넣으면 된다.
 */
export function runMigrations() {
  const db = getDb();
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schemaSql);

  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
    .get();
  const current = row ? Number(row.value) : 0;

  const migrations = [
    // 예시: { to: 2, up: (db) => { db.exec('ALTER TABLE ...'); } }
  ];

  let applied = current;
  for (const m of migrations) {
    if (m.to > applied) {
      m.up(db);
      applied = m.to;
    }
  }

  const stamp = nowSeoulStamp();
  db.prepare(
    "INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(String(Math.max(SCHEMA_VERSION, applied)));
  db.prepare(
    "INSERT INTO schema_meta(key, value) VALUES('migrated_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(stamp);

  return { from: current, to: Math.max(SCHEMA_VERSION, applied) };
}
