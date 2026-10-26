// 가벼운 서버측 검증 유틸 (zod 대체, 무의존성).

export class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details || null;
  }
}

export class NotFoundError extends Error {
  constructor(message = '리소스를 찾을 수 없습니다.') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
  }
}

export function requireString(v, field, { max = 2000, allowEmpty = false } = {}) {
  if (typeof v !== 'string') throw new ValidationError(`${field}은(는) 문자열이어야 합니다.`);
  const t = v.trim();
  if (!allowEmpty && t.length === 0) throw new ValidationError(`${field}을(를) 입력해 주세요.`);
  if (v.length > max) throw new ValidationError(`${field}이(가) 너무 깁니다 (최대 ${max}자).`);
  return v;
}

export function optString(v, field, opts = {}) {
  if (v === null || v === undefined || v === '') return null;
  return requireString(v, field, { ...opts, allowEmpty: true });
}

export function requireInt(v, field, { min, max } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ValidationError(`${field}은(는) 정수여야 합니다.`);
  if (min !== undefined && n < min) throw new ValidationError(`${field}은(는) ${min} 이상이어야 합니다.`);
  if (max !== undefined && n > max) throw new ValidationError(`${field}은(는) ${max} 이하여야 합니다.`);
  return n;
}

export function optInt(v, field, opts = {}) {
  if (v === null || v === undefined || v === '') return null;
  return requireInt(v, field, opts);
}

export function requireEnum(v, field, allowed) {
  if (!allowed.includes(v)) {
    throw new ValidationError(`${field} 값이 올바르지 않습니다. 허용: ${allowed.join(', ')}`);
  }
  return v;
}

export function requireDate(v, field) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new ValidationError(`${field}은(는) YYYY-MM-DD 형식이어야 합니다.`);
  }
  return v;
}

export function toBool01(v) {
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  return 0;
}
