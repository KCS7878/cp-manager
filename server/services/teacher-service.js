// 강사 / 학교 / 의의·규칙 안내문 서비스.
import { getDb, transaction } from '../db/connection.js';
import { nowSeoulStamp } from '../lib/time.js';
import { uniqueCode } from '../db/migrate.js';
import { getTeacherRules } from './rules-service.js';
import {
  requireString,
  optString,
  requireEnum,
  requireInt,
  NotFoundError,
  ValidationError,
} from '../lib/validation.js';

export async function listTeachers() {
  const db = getDb();
  return db.all(
    `SELECT t.*, (SELECT COUNT(*) FROM students s WHERE s.teacher_id = t.id AND s.archived = 0) AS student_count
       FROM teachers t ORDER BY t.id`,
    []
  );
}

export async function getTeacher(id) {
  const db = getDb();
  const row = await db.get('SELECT * FROM teachers WHERE id = ?', [id]);
  if (!row) throw new NotFoundError('강사를 찾을 수 없습니다.');
  return row;
}

export async function createTeacher(body) {
  return transaction(async (db) => {
    const name = requireString(body.name, '강사명', { max: 60 });
    const color = optString(body.color, '색상', { max: 20 }) || '#ee735a';
    const stamp = nowSeoulStamp();
    const code = await uniqueCode(db, 'T', 'teachers');
    const info = await db.run(
      'INSERT INTO teachers (name, color, access_code, created_at) VALUES (?, ?, ?, ?)',
      [name, color, code, stamp]
    );
    const id = Number(info.lastInsertRowid);
    await getTeacherRules(db, id); // 기본 규칙 생성
    await db.run('INSERT INTO guides (teacher_id, content, updated_at) VALUES (?, ?, ?)', [
      id,
      '',
      stamp,
    ]);
    return db.get('SELECT * FROM teachers WHERE id = ?', [id]);
  });
}

export async function updateTeacher(id, body) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM teachers WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('강사를 찾을 수 없습니다.');
    const name = body.name !== undefined ? requireString(body.name, '강사명', { max: 60 }) : existing.name;
    const color = body.color !== undefined ? requireString(body.color, '색상', { max: 20 }) : existing.color;
    await db.run('UPDATE teachers SET name = ?, color = ? WHERE id = ?', [name, color, id]);
    return db.get('SELECT * FROM teachers WHERE id = ?', [id]);
  });
}

export async function deleteTeacher(id) {
  return transaction(async (db) => {
    const existing = await db.get('SELECT * FROM teachers WHERE id = ?', [id]);
    if (!existing) throw new NotFoundError('강사를 찾을 수 없습니다.');
    // ON DELETE CASCADE가 학생/규칙/상품 등 연관 데이터 정리
    await db.run('DELETE FROM teachers WHERE id = ?', [id]);
    return { deleted: true };
  });
}

// ---- 학교 ----
export async function listSchools(teacherId) {
  const db = getDb();
  return db.all('SELECT * FROM schools WHERE teacher_id = ? ORDER BY name', [teacherId]);
}

export async function createSchool(teacherId, body) {
  return transaction(async (db) => {
    const name = requireString(body.name, '학교명', { max: 60 });
    const level = requireEnum(body.level || 'etc', '학교급', ['middle', 'high', 'etc']);
    const info = await db.run(
      'INSERT INTO schools (teacher_id, name, level, created_at) VALUES (?, ?, ?, ?)',
      [teacherId, name, level, nowSeoulStamp()]
    );
    return db.get('SELECT * FROM schools WHERE id = ?', [Number(info.lastInsertRowid)]);
  });
}

export async function deleteSchool(id) {
  return transaction(async (db) => {
    await db.run('DELETE FROM schools WHERE id = ?', [id]);
    return { deleted: true };
  });
}

// ---- 의의 및 규칙 안내문 ----
export async function getGuide(teacherId) {
  const db = getDb();
  let row = await db.get('SELECT * FROM guides WHERE teacher_id = ?', [teacherId]);
  if (!row) {
    await db.run('INSERT INTO guides (teacher_id, content, updated_at) VALUES (?, ?, ?)', [
      teacherId,
      '',
      nowSeoulStamp(),
    ]);
    row = await db.get('SELECT * FROM guides WHERE teacher_id = ?', [teacherId]);
  }
  return row;
}

export async function updateGuide(teacherId, content) {
  return transaction(async (db) => {
    if (typeof content !== 'string') throw new ValidationError('내용은 문자열이어야 합니다.');
    if (content.length > 12000) throw new ValidationError('안내문은 최대 12,000자까지 가능합니다.');
    await db.run('INSERT INTO guides (teacher_id, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(teacher_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at', [
      teacherId,
      content,
      nowSeoulStamp(),
    ]);
    return db.get('SELECT * FROM guides WHERE teacher_id = ?', [teacherId]);
  });
}

/** 규칙을 반영한 안내문 기본 초안 생성 */
export async function generateGuideDraft(teacherId) {
  const db = getDb();
  const r = await getTeacherRules(db, teacherId);
  return `# CP 매니저의 의의 및 규칙

## 1. CP 매니저의 목적
CP(Credit Point)는 단순 점수가 아니라 여러분의 학습 행동을 기록하고 보상하기 위한 제도입니다.
단어시험, 출결, 수업 참여, 성적 관리 등 꾸준한 노력을 눈에 보이는 점수로 쌓아, 스스로의 성장을 확인하고 보상으로 돌려받도록 돕습니다.

## 2. 단어시험 CP 규칙
- 통과 기준: ${r.word_pass_score}점 이상
- 기한 내 통과: +${r.pass_in_time_cp} CP
- 만점(100점) 추가 보너스: +${r.perfect_bonus_cp} CP (만점 시 총 +${r.pass_in_time_cp + r.perfect_bonus_cp} CP)
- 기한 이후 통과: ${r.pass_late_cp} CP
- 미응시: ${r.no_show_cp} CP
- 시험 없음 / 기타(정당한 사유): 0 CP

## 3. 출결과 월간 보너스
- 지각 인정 기준: ${r.late_grace_min}분
- 기준 이상 지각: 1분당 ${-r.late_penalty_per_min} CP
- 월간 무지각 보너스: +${r.monthly_no_late_bonus} CP
- 월간 단어시험 성실 보너스: +${r.monthly_word_bonus} CP (그 달 단어시험을 모두 기한 내 통과한 경우)

## 4. 적극적인 수업 참여 보너스
- 한 수업에서 적극적으로 참여하면 참여 스택이 쌓입니다.
- 한 수업일 3회 참여 시 +${r.participation_stack3_cp} CP를 지급합니다. (하루 최대 보너스 1회)

## 5. CP 사용 방식
- 이번 달에 얻은 CP는 '대기 CP'가 되며, 다음 달 1일부터 '사용 가능 CP'로 전환됩니다.
- 사용 가능 CP로 상점에서 상품을 구매할 수 있습니다.

## 6. 강사와 학생이 지킬 약속
- 강사는 기록을 공정하고 투명하게 관리하며, 꾸준한 노력을 반드시 보상합니다.
- 학생은 단어시험과 숙제를 기한 내에 성실히 수행하고, 수업에 적극적으로 참여합니다.
- 함께 약속을 지켜 즐겁고 성장하는 수업을 만들어 갑시다!`;
}
