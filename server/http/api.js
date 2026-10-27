// API 라우트 정의 (async). 모든 서비스를 REST 엔드포인트에 연결한다.
import { Router } from './router.js';
import * as teacherSvc from '../services/teacher-service.js';
import * as studentSvc from '../services/student-service.js';
import * as detailSvc from '../services/student-detail-service.js';
import * as rulesSvc from '../services/rules-service.js';
import * as lessonSvc from '../services/lesson-service.js';
import * as examSvc from '../services/exam-service.js';
import * as manualSvc from '../services/manual-cp-service.js';
import * as partSvc from '../services/participation-service.js';
import * as bonusSvc from '../services/bonus-service.js';
import * as shopSvc from '../services/shop-service.js';
import * as rankSvc from '../services/ranking-service.js';
import * as backupSvc from '../services/backup-service.js';
import * as coachSvc from '../services/coach-service.js';
import * as uploadSvc from '../services/upload-service.js';
import * as accessSvc from '../services/access-service.js';
import { getLedger } from '../services/ledger-service.js';
import { getDb } from '../db/connection.js';
import { EXAM_TYPES } from '../lib/exam-types.js';

const router = new Router();
const num = (v) => Number(v);

// ---- 헬스/메타 ----
router.get('/api/health', () => ({ ok: true, time: new Date().toISOString() }));
router.get('/api/exam-types', () => ({ types: EXAM_TYPES }));

// ---- 접속 코드 (선생님/학생 로그인 대용) ----
router.post('/api/access/resolve', async (ctx) => accessSvc.resolveAccessCode(ctx.body.code));
router.get('/api/teachers/:id/code', async (ctx) => ({ code: await accessSvc.getTeacherCode(num(ctx.params.id)) }));
router.get('/api/students/:id/code', async (ctx) => ({ code: await accessSvc.getStudentCode(num(ctx.params.id)) }));
router.post('/api/teachers/:id/code/regenerate', async (ctx) => accessSvc.regenerateCode('teacher', num(ctx.params.id)));
router.post('/api/students/:id/code/regenerate', async (ctx) => accessSvc.regenerateCode('student', num(ctx.params.id)));

// ---- 학생 읽기 전용 화면 ----
router.get('/api/students/:id/public', async (ctx) => accessSvc.getStudentPublicView(num(ctx.params.id)));

// ---- 총관리자: 전체 강사 관리 ----
router.get('/api/admin/teachers', async () => ({ teachers: await accessSvc.adminListTeachers() }));

// ---- 강사 ----
router.get('/api/teachers', async () => ({ teachers: await teacherSvc.listTeachers() }));
router.post('/api/teachers', async (ctx) => ({ teacher: await teacherSvc.createTeacher(ctx.body) }));
router.put('/api/teachers/:id', async (ctx) => ({ teacher: await teacherSvc.updateTeacher(num(ctx.params.id), ctx.body) }));
router.delete('/api/teachers/:id', async (ctx) => teacherSvc.deleteTeacher(num(ctx.params.id)));

// 강사 규칙
router.get('/api/teachers/:id/rules', async (ctx) => ({ rules: await rulesSvc.getTeacherRules(getDb(), num(ctx.params.id)) }));
router.put('/api/teachers/:id/rules', async (ctx) => ({ rules: await rulesSvc.updateTeacherRules(num(ctx.params.id), ctx.body) }));

// 학교
router.get('/api/teachers/:id/schools', async (ctx) => ({ schools: await teacherSvc.listSchools(num(ctx.params.id)) }));
router.post('/api/teachers/:id/schools', async (ctx) => ({ school: await teacherSvc.createSchool(num(ctx.params.id), ctx.body) }));
router.delete('/api/schools/:id', async (ctx) => teacherSvc.deleteSchool(num(ctx.params.id)));

// 분반
router.get('/api/teachers/:id/classes', async (ctx) => ({ classes: await studentSvc.listClasses(num(ctx.params.id)) }));

// 의의 및 규칙
router.get('/api/teachers/:id/guide', async (ctx) => ({ guide: await teacherSvc.getGuide(num(ctx.params.id)) }));
router.put('/api/teachers/:id/guide', async (ctx) => ({ guide: await teacherSvc.updateGuide(num(ctx.params.id), ctx.body.content) }));
router.get('/api/teachers/:id/guide/draft', async (ctx) => ({ draft: await teacherSvc.generateGuideDraft(num(ctx.params.id)) }));

// ---- 학생 ----
router.get('/api/students', async (ctx) => {
  const q = ctx.query;
  const teacherId = q.teacher_id ? num(q.teacher_id) : null;
  return {
    students: await studentSvc.listStudents(teacherId, {
      scope: q.scope, teacherId: q.teacher_id, school: q.school, className: q.class_name,
      level: q.level, grade: q.grade, name: q.name, sort: q.sort,
    }),
  };
});
router.post('/api/students', async (ctx) => ({ student: await studentSvc.createStudent(ctx.body) }));
router.get('/api/students/:id', async (ctx) => ({ student: await studentSvc.getStudent(num(ctx.params.id)) }));
router.put('/api/students/:id', async (ctx) => ({ student: await studentSvc.updateStudent(num(ctx.params.id), ctx.body) }));
router.get('/api/students/:id/deletion-impact', async (ctx) => studentSvc.getStudentDeletionImpact(num(ctx.params.id)));
router.delete('/api/students/:id', async (ctx) => studentSvc.deleteStudent(num(ctx.params.id)));

// 학생 상세 (전환 시 단일 호출)
router.get('/api/students/:id/detail', async (ctx) => detailSvc.getStudentDetail(num(ctx.params.id)));

// 학생 예외 규칙
router.get('/api/students/:id/rules', async (ctx) => ({ override: await rulesSvc.getStudentOverride(getDb(), num(ctx.params.id)) }));
router.put('/api/students/:id/rules', async (ctx) => ({ override: await rulesSvc.updateStudentOverride(num(ctx.params.id), ctx.body) }));

// 장부
router.get('/api/students/:id/ledger', async (ctx) => ({ ledger: await getLedger(getDb(), num(ctx.params.id)) }));

// 수동 CP
router.post('/api/students/:id/manual-cp', async (ctx) => ({ entry: await manualSvc.grantManualCp(num(ctx.params.id), ctx.body) }));
router.delete('/api/ledger/:id', async (ctx) => manualSvc.deleteManualCp(num(ctx.params.id)));

// ---- 수업 ----
router.get('/api/students/:id/lessons', async (ctx) => ({ lessons: await lessonSvc.listLessons(num(ctx.params.id)) }));
router.post('/api/students/:id/lessons', async (ctx) => ({ lesson: await lessonSvc.createLesson(num(ctx.params.id), ctx.body) }));
router.put('/api/lessons/:id', async (ctx) => ({ lesson: await lessonSvc.updateLesson(num(ctx.params.id), ctx.body) }));
router.delete('/api/lessons/:id', async (ctx) => lessonSvc.deleteLesson(num(ctx.params.id)));

// ---- 시험 ----
router.get('/api/students/:id/exams', async (ctx) => ({ exams: await examSvc.listExams(num(ctx.params.id)) }));
router.post('/api/students/:id/exams', async (ctx) => ({ exam: await examSvc.createExam(num(ctx.params.id), ctx.body) }));
router.put('/api/exams/:id', async (ctx) => ({ exam: await examSvc.updateExam(num(ctx.params.id), ctx.body) }));
router.delete('/api/exams/:id', async (ctx) => examSvc.deleteExam(num(ctx.params.id)));
router.get('/api/students/:id/exam-analysis', async (ctx) => examSvc.analyzeExams(num(ctx.params.id)));

// ---- AI 코치 ----
router.get('/api/students/:id/coach', async (ctx) => coachSvc.coachAnalyze(num(ctx.params.id)));

// ---- 참여 리모콘 ----
router.get('/api/participation', async (ctx) => ({
  students: await partSvc.getParticipation(num(ctx.query.teacher_id), ctx.query.class_name, ctx.query.lesson_date),
}));
router.post('/api/students/:id/participation', async (ctx) => ({
  result: await partSvc.adjustParticipation(num(ctx.params.id), ctx.body),
}));

// ---- 월간 보너스 ----
router.get('/api/students/:id/bonuses', async (ctx) => ({ bonuses: await bonusSvc.listMonthlyBonuses(num(ctx.params.id)) }));
router.post('/api/students/:id/bonuses/:month', async (ctx) =>
  ({ bonus: await bonusSvc.computeAndSaveMonthlyBonus(num(ctx.params.id), ctx.params.month) }));
router.put('/api/students/:id/bonuses/:month', async (ctx) =>
  ({ bonus: await bonusSvc.adjustMonthlyBonus(num(ctx.params.id), ctx.params.month, ctx.body.manual_adjust) }));
router.delete('/api/students/:id/bonuses/:month', async (ctx) =>
  bonusSvc.removeMonthlyBonus(num(ctx.params.id), ctx.params.month));

// ---- 상점 ----
router.get('/api/teachers/:id/products', async (ctx) => ({ products: await shopSvc.listProducts(num(ctx.params.id)) }));
router.post('/api/teachers/:id/products', async (ctx) => ({ product: await shopSvc.createProduct(num(ctx.params.id), ctx.body) }));
router.put('/api/products/:id', async (ctx) => ({ product: await shopSvc.updateProduct(num(ctx.params.id), ctx.body) }));
router.post('/api/products/:id/end', async (ctx) => ({ product: await shopSvc.endProduct(num(ctx.params.id)) }));
router.get('/api/students/:id/products', async (ctx) => {
  const s = await studentSvc.getStudent(num(ctx.params.id));
  return { products: await shopSvc.listProductsForStudent(s.teacher_id, s.id) };
});
router.put('/api/students/:sid/products/:pid/price', async (ctx) =>
  ({ result: await shopSvc.setStudentPrice(num(ctx.params.sid), num(ctx.params.pid), ctx.body.cp_price) }));

// 이미지 업로드
router.post('/api/upload', async (ctx) => ({ url: await uploadSvc.saveImageDataUrl(ctx.body.dataUrl) }));

// ---- 구매/인벤토리 ----
router.post('/api/students/:id/purchase', async (ctx) => ({ purchase: await shopSvc.purchase(num(ctx.params.id), num(ctx.body.product_id)) }));
router.get('/api/teachers/:id/purchases', async (ctx) =>
  ({ purchases: await shopSvc.listPurchases(num(ctx.params.id), ctx.query.student_id ? num(ctx.query.student_id) : null) }));
router.get('/api/students/:id/inventory', async (ctx) => ({ inventory: await shopSvc.listInventory(num(ctx.params.id)) }));
router.put('/api/purchases/:id/state', async (ctx) => ({ purchase: await shopSvc.setInventoryState(num(ctx.params.id), ctx.body.state) }));
router.delete('/api/purchases/:id', async (ctx) => shopSvc.refundPurchase(num(ctx.params.id)));

// ---- 랭킹 ----
router.get('/api/teachers/:id/ranking', async (ctx) =>
  rankSvc.getRanking(num(ctx.params.id), {
    basis: ctx.query.basis || 'cumulative',
    filter: { level: ctx.query.level, school: ctx.query.school, className: ctx.query.class_name, grade: ctx.query.grade },
  }));
router.post('/api/teachers/:id/quarter-titles/confirm', async (ctx) =>
  rankSvc.confirmQuarterTitles(num(ctx.params.id), { force: !!ctx.body.force }));
router.get('/api/teachers/:id/quarter-titles', async (ctx) => ({ titles: await rankSvc.listQuarterTitles(num(ctx.params.id)) }));

// ---- 백업/복원 ----
router.get('/api/backup/export', async (ctx) => backupSvc.exportData(ctx.query.teacher_id ? num(ctx.query.teacher_id) : null));
router.post('/api/backup/compare', async (ctx) =>
  backupSvc.compareData(ctx.body.payload, ctx.body.teacher_id ? num(ctx.body.teacher_id) : null));
router.post('/api/backup/import', async (ctx) =>
  backupSvc.importData(ctx.body.payload, {
    confirm: !!ctx.body.confirm,
    scope: ctx.body.scope || 'all',
    teacherId: ctx.body.teacher_id ? num(ctx.body.teacher_id) : null,
  }));
router.get('/api/backup/list', async () => ({ backups: await backupSvc.listBackups() }));

// ---- 학생 외부 데이터화 ----
router.get('/api/students/:id/export', async (ctx) => backupSvc.exportStudent(num(ctx.params.id)));
router.get('/api/teachers/:id/students-csv', async (ctx) => ({
  __raw: true,
  contentType: 'text/csv; charset=utf-8',
  filename: `학생명단_${ctx.query.name || 'teacher'}.csv`,
  data: await backupSvc.exportStudentsCsv(num(ctx.params.id)),
}));

export default router;
