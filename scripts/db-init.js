// DB 초기화: 스키마 생성 + 마이그레이션.
import { runMigrations } from '../server/db/migrate.js';
import { getDbPath } from '../server/db/connection.js';

const result = runMigrations();
console.log(`[db:init] DB 경로: ${getDbPath()}`);
console.log(`[db:init] 스키마 적용 완료 (v${result.from} -> v${result.to})`);
