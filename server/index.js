// CP 매니저 HTTP 서버 (무의존성 Node.js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './db/migrate.js';
import apiRouter from './http/api.js';
import { promotePendingToAvailable } from './services/ledger-service.js';
import { ValidationError, NotFoundError, ConflictError } from './lib/validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT || 3000);
// 관리자 접근 보호용 키. 미설정 시 보호 비활성(개발 편의).
const ADMIN_KEY = process.env.CP_ADMIN_KEY || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new ValidationError('요청 본문이 너무 큽니다.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ValidationError('JSON 파싱에 실패했습니다.'));
      }
    });
    req.on('error', reject);
  });
}

function mapError(err) {
  if (err instanceof ValidationError) return { status: err.status || 400, body: { error: err.message, code: 'VALIDATION', details: err.details } };
  if (err instanceof NotFoundError) return { status: 404, body: { error: err.message, code: 'NOT_FOUND' } };
  if (err instanceof ConflictError) return { status: 409, body: { error: err.message, code: 'CONFLICT' } };
  // SQLite 제약 위반 등
  const msg = String(err && err.message ? err.message : err);
  console.error('[server error]', msg);
  return { status: 500, body: { error: '서버 오류가 발생했습니다.', code: 'INTERNAL', detail: msg } };
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // 디렉터리 트래버설 방지
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (e2, data) => {
        if (e2) { res.writeHead(404); return res.end('Not Found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    // 관리자 보호 (ADMIN_KEY 설정 시). 헬스 체크는 공개.
    if (ADMIN_KEY && pathname !== '/api/health') {
      const key = req.headers['x-admin-key'] || url.searchParams.get('admin_key');
      if (key !== ADMIN_KEY) {
        return sendJson(res, 401, { error: '관리자 인증이 필요합니다.', code: 'UNAUTHORIZED' });
      }
    }
    const match = apiRouter.match(req.method, pathname);
    if (!match) return sendJson(res, 404, { error: '엔드포인트를 찾을 수 없습니다.', code: 'NOT_FOUND' });

    try {
      let body = {};
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        body = await readBody(req);
      }
      const query = Object.fromEntries(url.searchParams.entries());
      const result = await match.handler({ params: match.params, query, body, req });
      // 원시 응답(파일 다운로드: CSV 등) 지원
      if (result && result.__raw) {
        const headers = { 'Content-Type': result.contentType || 'application/octet-stream' };
        if (result.filename) {
          headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`;
        }
        const buf = Buffer.from(result.data, 'utf8');
        headers['Content-Length'] = buf.length;
        res.writeHead(200, headers);
        return res.end(buf);
      }
      return sendJson(res, 200, result ?? { ok: true });
    } catch (err) {
      const { status, body } = mapError(err);
      return sendJson(res, status, body);
    }
  }

  // 정적 파일
  if (req.method !== 'GET') { res.writeHead(405); return res.end('Method Not Allowed'); }
  serveStatic(req, res, pathname);
}

// 초기화
runMigrations();
promotePendingToAvailable();

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const { status, body } = mapError(err);
    sendJson(res, status, body);
  });
});

server.listen(PORT, () => {
  console.log(`[CP 매니저] 서버 실행 중: http://localhost:${PORT}`);
  if (ADMIN_KEY) console.log('[CP 매니저] 관리자 키 보호 활성화됨 (x-admin-key 헤더 필요)');
});
