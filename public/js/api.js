// API 클라이언트: 타임아웃, 오류 구분, 중복 요청 방지.
const DEFAULT_TIMEOUT = 15000;

// 총관리자(full admin) 코드. admin 전용 API 호출 시 x-admin-code 헤더로 전송된다.
// 세션 한정(sessionStorage): 탭을 닫으면 사라지며, 학생/선생님 모드에선 설정되지 않는다.
let adminCode = null;
try { adminCode = sessionStorage.getItem('cp.adminCode') || null; } catch {}
export function setAdminCode(code) {
  adminCode = code || null;
  try {
    if (adminCode) sessionStorage.setItem('cp.adminCode', adminCode);
    else sessionStorage.removeItem('cp.adminCode');
  } catch {}
}
export function hasAdminCode() { return !!adminCode; }

// 진행 중 요청 추적 (같은 key 중복 실행 방지 / 이전 요청 취소)
const inflight = new Map();

export class ApiError extends Error {
  constructor(message, { status, code, kind } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.kind = kind; // 'timeout'|'network'|'parse'|'http'
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {object} opts { body, query, timeout, dedupKey, signal }
 */
export async function request(method, path, opts = {}) {
  const { body, query, timeout = DEFAULT_TIMEOUT, dedupKey, signalOwnerKey } = opts;

  let url = path;
  if (query) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  // 이전 동일 owner 요청 취소 (학생 전환 시 이전 상세 요청 취소)
  if (signalOwnerKey && inflight.has(signalOwnerKey)) {
    inflight.get(signalOwnerKey).abort();
  }

  // dedup: 완전히 동일한 요청이 진행 중이면 그 프라미스 재사용
  const key = dedupKey || `${method} ${url}`;
  if (!signalOwnerKey && inflight.has(key) && inflight.get(key).promise) {
    return inflight.get(key).promise;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new ApiError('시간 초과', { kind: 'timeout' })), timeout);

  const entry = { abort: () => controller.abort(), promise: null };
  if (signalOwnerKey) inflight.set(signalOwnerKey, entry);

  const exec = (async () => {
    let res;
    try {
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      if (adminCode) headers['x-admin-code'] = adminCode; // 총관리자 전용 API 인증
      res = await fetch(url, {
        method,
        headers: Object.keys(headers).length ? headers : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason instanceof ApiError && reason.kind === 'timeout') {
          throw new ApiError('요청 시간이 초과되었습니다. 다시 시도해 주세요.', { kind: 'timeout' });
        }
        throw new ApiError('요청이 취소되었습니다.', { kind: 'aborted' });
      }
      throw new ApiError('네트워크 연결에 실패했습니다.', { kind: 'network' });
    }
    clearTimeout(timer);

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      // 서버가 JSON 대신 HTML 오류 페이지를 반환한 경우
      throw new ApiError(
        `서버가 올바른 응답(JSON)을 반환하지 않았습니다. (HTTP ${res.status})`,
        { status: res.status, kind: 'parse' }
      );
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new ApiError('응답 JSON 파싱에 실패했습니다.', { status: res.status, kind: 'parse' });
    }

    if (!res.ok) {
      const map = { 404: '요청한 데이터를 찾을 수 없습니다.', 500: '서버 내부 오류입니다.', 504: '게이트웨이 시간 초과입니다.' };
      throw new ApiError(data.error || map[res.status] || `오류 (HTTP ${res.status})`, {
        status: res.status,
        code: data.code,
        kind: 'http',
      });
    }
    return data;
  })();

  entry.promise = exec;
  if (!signalOwnerKey) inflight.set(key, entry);

  try {
    return await exec;
  } finally {
    if (inflight.get(key) === entry) inflight.delete(key);
    if (signalOwnerKey && inflight.get(signalOwnerKey) === entry) inflight.delete(signalOwnerKey);
  }
}

export const api = {
  get: (p, opts) => request('GET', p, opts),
  post: (p, body, opts) => request('POST', p, { ...opts, body }),
  put: (p, body, opts) => request('PUT', p, { ...opts, body }),
  del: (p, opts) => request('DELETE', p, opts),
};
