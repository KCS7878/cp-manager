// 스키마 적용 및 마이그레이션 실행 (async).
import { getDb } from './connection.js';
import { nowSeoulStamp } from '../lib/time.js';
import { SCHEMA_SQL } from './schema-sql.js';

export const SCHEMA_VERSION = 1;

/**
 * 스키마를 적용(IF NOT EXISTS 기반 idempotent)하고 버전을 기록한다.
 * 로컬/D1 공통으로 동작 (db.exec은 어댑터가 문장 분리 처리).
 */
export async function runMigrations() {
  const db = getDb();
  await db.exec(SCHEMA_SQL);

  const row = await db.get("SELECT value FROM schema_meta WHERE key = 'version'");
  const current = row ? Number(row.value) : 0;

  const migrations = [
    // 예시: { to: 2, up: async (db) => { await db.exec('ALTER TABLE ...'); } }
  ];

  let applied = current;
  for (const m of migrations) {
    if (m.to > applied) {
      await m.up(db);
      applied = m.to;
    }
  }

  const stamp = nowSeoulStamp();
  await db.run(
    "INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [String(Math.max(SCHEMA_VERSION, applied))]
  );
  await db.run(
    "INSERT INTO schema_meta(key, value) VALUES('migrated_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [stamp]
  );

  return { from: current, to: Math.max(SCHEMA_VERSION, applied) };
}
