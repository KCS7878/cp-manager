// DB가 없으면 자동 초기화 + 시드한 뒤 서버를 시작한다.
import fs from 'node:fs';
import { getDbPath } from '../server/db/local-db.js';

const dbPath = getDbPath();
if (!fs.existsSync(dbPath)) {
  console.log('[start] 데이터베이스가 없어 초기화 + 시드를 진행합니다...');
  await import('./db-init.js');
  await import('./db-seed.js');
}
// 서버 기동
await import('../server/index.js');
