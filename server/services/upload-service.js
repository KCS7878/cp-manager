// 상품 이미지 업로드 (객체 저장소 추상화).
// 가정: 로컬 파일시스템(public/uploads)에 저장. R2/S3로 교체 시 이 모듈만 바꾸면 된다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ValidationError } from '../lib/validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads');

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * dataURL (base64) 이미지를 저장하고 공개 경로를 반환한다.
 * 최대 5MB 제한.
 */
export function saveImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new ValidationError('이미지 데이터 형식이 올바르지 않습니다.');
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new ValidationError('base64 이미지만 지원합니다.');
  const mime = match[1];
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new ValidationError('지원하지 않는 이미지 형식입니다. (png/jpg/gif/webp)');
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new ValidationError('이미지는 최대 5MB까지 가능합니다.');

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
