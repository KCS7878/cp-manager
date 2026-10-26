// 상품 이미지 업로드 (환경 적응형, async).
// - 로컬(Node): public/uploads 파일로 저장 → '/uploads/xxx' 경로 반환.
// - Cloudflare Workers(파일시스템 없음): data URL을 그대로 반환해 DB에 인라인 저장.
//   (추후 R2 연동 시 이 모듈만 교체)
import { ValidationError } from '../lib/validation.js';

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// Node 환경 여부 (Workers에는 process.versions.node 가 없음)
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

export async function saveImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new ValidationError('이미지 데이터 형식이 올바르지 않습니다.');
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new ValidationError('base64 이미지만 지원합니다.');
  const mime = match[1];
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new ValidationError('지원하지 않는 이미지 형식입니다. (png/jpg/gif/webp)');

  // 크기 제한 (base64 길이로 근사: 5MB)
  const approxBytes = Math.floor((match[2].length * 3) / 4);
  if (approxBytes > 5 * 1024 * 1024) throw new ValidationError('이미지는 최대 5MB까지 가능합니다.');

  if (isNode) {
    // 로컬: 파일로 저장
    const fs = await import('node:fs');
    const path = await import('node:path');
    const crypto = await import('node:crypto');
    const { fileURLToPath } = await import('node:url');
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/uploads');
    const buf = Buffer.from(match[2], 'base64');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    return `/uploads/${name}`;
  }

  // Workers: data URL을 그대로 반환 (DB에 인라인 저장)
  return dataUrl;
}
