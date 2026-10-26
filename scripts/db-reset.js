// DB 완전 초기화: 파일 삭제 후 재생성 + 시드.
import fs from 'node:fs';
import { getDbPath } from '../server/db/local-db.js';

const dbPath = getDbPath();
for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const f = dbPath + suffix;
  if (fs.existsSync(f)) fs.rmSync(f);
}
console.log('[db:reset] 기존 DB 삭제 완료');

await import('./db-init.js');
await import('./db-seed.js');
console.log('[db:reset] 완료');
