// 서비스 레이어 통합 테스트 (임시 DB 사용, async).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `cp-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.CP_DB_PATH = tmpDb;

const { runMigrations } = await import('../server/db/migrate.js');
const { getDb, closeDb, initLocalDb } = await import('../server/db/connection.js');
const teacherSvc = await import('../server/services/teacher-service.js');
const studentSvc = await import('../server/services/student-service.js');
const lessonSvc = await import('../server/services/lesson-service.js');
const ledgerSvc = await import('../server/services/ledger-service.js');
const shopSvc = await import('../server/services/shop-service.js');
const manualSvc = await import('../server/services/manual-cp-service.js');
const partSvc = await import('../server/services/participation-service.js');
const { todaySeoul } = await import('../server/lib/time.js');

before(async () => {
  await initLocalDb();
  await runMigrations();
});
after(async () => {
  await closeDb();
  for (const s of ['', '-wal', '-shm']) if (fs.existsSync(tmpDb + s)) fs.rmSync(tmpDb + s);
});

let teacherId, studentId;

test('강사/학생 생성', async () => {
  const t = await teacherSvc.createTeacher({ name: '테스트강사' });
  teacherId = t.id;
  const s = await studentSvc.createStudent({ teacher_id: teacherId, name: '테스트학생', word_input_mode: 'count' });
  studentId = s.id;
  assert.ok(studentId > 0);
});

test('수업 생성 시 CP 장부 자동 기록 (오늘 발생 → 대기)', async () => {
  const today = todaySeoul();
  await lessonSvc.createLesson(studentId, {
    lesson_date: today, attendance: 'present', word_status: 'taken',
    word_seen: 50, word_wrong: 0, deadline_met: 1,
  });
  const bal = await ledgerSvc.getStudentBalance(getDb(), studentId);
  assert.equal(bal.pending, 15);
  assert.equal(bal.cumulative, 15);
});

test('수업 수정 시 CP 되돌린 뒤 재계산', async () => {
  const lessons = await lessonSvc.listLessons(studentId);
  const lesson = lessons[0];
  await lessonSvc.updateLesson(lesson.id, { word_wrong: 10 }); // 80점 통과, 기한내 → +10
  const bal = await ledgerSvc.getStudentBalance(getDb(), studentId);
  assert.equal(bal.cumulative, 10);
});

test('수업 삭제 시 CP 효과 제거', async () => {
  const lessons = await lessonSvc.listLessons(studentId);
  await lessonSvc.deleteLesson(lessons[0].id);
  const bal = await ledgerSvc.getStudentBalance(getDb(), studentId);
  assert.equal(bal.cumulative, 0);
});

test('수동 즉시 CP 지급 → 가용', async () => {
  await manualSvc.grantManualCp(studentId, { amount: 100, reason: '테스트', immediate: true });
  const bal = await ledgerSvc.getStudentBalance(getDb(), studentId);
  assert.equal(bal.available, 100);
});

test('상품 구매: 가용 CP 차감 + 인벤토리 보유', async () => {
  const p = await shopSvc.createProduct(teacherId, { name: '테스트상품', base_cp: 30 });
  const purchase = await shopSvc.purchase(studentId, p.id);
  assert.equal(purchase.inventory_state, 'owned');
  const bal = await ledgerSvc.getStudentBalance(getDb(), studentId);
  assert.equal(bal.available, 70); // 100 - 30
  assert.equal(bal.cumulative, 100); // 구매 제외
});

test('CP 부족 시 구매 실패', async () => {
  const p = await shopSvc.createProduct(teacherId, { name: '비싼상품', base_cp: 9999 });
  await assert.rejects(() => shopSvc.purchase(studentId, p.id), /부족/);
});

test('상품 사용 처리 및 되돌리기', async () => {
  const inv = await shopSvc.listInventory(studentId);
  const used = await shopSvc.setInventoryState(inv[0].id, 'used');
  assert.equal(used.inventory_state, 'used');
  assert.ok(used.used_at);
  const back = await shopSvc.setInventoryState(inv[0].id, 'owned');
  assert.equal(back.inventory_state, 'owned');
  assert.equal(back.used_at, null);
});

test('참여 3스택 시 보너스, 2스택으로 정정 시 회수', async () => {
  const today = todaySeoul();
  const before = (await ledgerSvc.getStudentBalance(getDb(), studentId)).cumulative;
  await partSvc.adjustParticipation(studentId, { lesson_date: today, delta: 1 });
  await partSvc.adjustParticipation(studentId, { lesson_date: today, delta: 1 });
  const r3 = await partSvc.adjustParticipation(studentId, { lesson_date: today, delta: 1 });
  assert.equal(r3.stack, 3);
  assert.equal(r3.bonus_given, 1);
  const after3 = (await ledgerSvc.getStudentBalance(getDb(), studentId)).cumulative;
  assert.equal(after3 - before, 5);

  const r2 = await partSvc.adjustParticipation(studentId, { lesson_date: today, delta: -1 });
  assert.equal(r2.stack, 2);
  assert.equal(r2.bonus_given, 0);
  const after2 = (await ledgerSvc.getStudentBalance(getDb(), studentId)).cumulative;
  assert.equal(after2 - before, 0);
});

test("'기타' 상태는 사유 필수", async () => {
  await assert.rejects(
    () => lessonSvc.createLesson(studentId, { lesson_date: todaySeoul(), word_status: 'etc' }),
    /사유/
  );
});

test('학생 삭제 시 연관 기록 영향 조회', async () => {
  const impact = await studentSvc.getStudentDeletionImpact(studentId);
  assert.ok(impact.ledger >= 0);
  assert.equal(impact.student, '테스트학생');
});
