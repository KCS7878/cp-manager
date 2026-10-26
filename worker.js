// Cloudflare Workers 진입점.
// - 정적 자산(public/)은 wrangler assets 바인딩(env.ASSETS)이 자동 서빙.
// - /api/* 요청만 이 Worker가 처리.
// - D1 데이터베이스는 env.DB 바인딩으로 주입.
import apiRouter from './server/http/api.js';
import { setD1Binding } from './server/db/connection.js';
import { runMigrations } from './server/db/migrate.js';
import { promotePendingToAvailable } from './server/services/ledger-service.js';
import { ValidationError, NotFoundError, ConflictError } from './server/lib/validation.js';

let migrated = false;

function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function mapError(err) {
  if (err instanceof ValidationError) return { status: err.status || 400, body: { error: err.message, code: 'VALIDATION', details: err.details || null } };
  if (err instanceof NotFoundError) return { status: 404, body: { error: err.message, code: 'NOT_FOUND' } };
  if (err instanceof ConflictError) return { status: 409, body: { error: err.message, code: 'CONFLICT' } };
  const msg = String(err && err.message ? err.message : err);
  console.error('[worker error]', msg);
  return { status: 500, body: { error: '서버 오류가 발생했습니다.', code: 'INTERNAL', detail: msg } };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // API가 아니면 정적 자산으로 위임
    if (!pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not Found', { status: 404 });
    }

    // D1 바인딩 주입
    if (!env.DB) return jsonResponse(500, { error: 'D1 데이터베이스(DB) 바인딩이 없습니다.', code: 'NO_DB' });
    setD1Binding(env.DB);

    // 최초 요청 시 스키마 보장 (idempotent)
    if (!migrated) {
      try {
        await runMigrations();
        await promotePendingToAvailable();
        migrated = true;
      } catch (e) {
        return jsonResponse(500, { error: '스키마 초기화 실패: ' + (e.message || e), code: 'MIGRATE_FAIL' });
      }
    }

    // 관리자 보호 (CP_ADMIN_KEY 설정 시, 헬스 체크 제외)
    const ADMIN_KEY = env.CP_ADMIN_KEY || '';
    if (ADMIN_KEY && pathname !== '/api/health') {
      const key = request.headers.get('x-admin-key') || url.searchParams.get('admin_key');
      if (key !== ADMIN_KEY) return jsonResponse(401, { error: '관리자 인증이 필요합니다.', code: 'UNAUTHORIZED' });
    }

    const match = apiRouter.match(request.method, pathname);
    if (!match) return jsonResponse(404, { error: '엔드포인트를 찾을 수 없습니다.', code: 'NOT_FOUND' });

    try {
      let body = {};
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        const text = await request.text();
        if (text) {
          try { body = JSON.parse(text); }
          catch { return jsonResponse(400, { error: 'JSON 파싱에 실패했습니다.', code: 'VALIDATION' }); }
        }
      }
      const query = Object.fromEntries(url.searchParams.entries());
      const result = await match.handler({ params: match.params, query, body, req: request });

      // 원시 응답(CSV 등)
      if (result && result.__raw) {
        const headers = { 'Content-Type': result.contentType || 'application/octet-stream' };
        if (result.filename) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`;
        return new Response(result.data, { status: 200, headers });
      }
      return jsonResponse(200, result ?? { ok: true });
    } catch (err) {
      const { status, body } = mapError(err);
      return jsonResponse(status, body);
    }
  },
};
