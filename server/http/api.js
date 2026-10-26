// API 라우트 정의. 모든 서비스를 REST 엔드포인트에 연결한다.
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
import { getLedger } from '../services/ledger-service.js';
import { getDb } from '../db/connection.js';
import { EXAM_TYPES } from '../lib/exam-types.js';

const router = new Router();
const num = (v) => Number(v);

// ---- 헬스/메타 ----
router.get('/api/health', () => ({ ok: true, time: new Date().toISOString() }));
router.get('/api/exam-types', () => ({ types: EXAM_TYPES }));

// ---- 강사 ----
router.get('/api/teachers', () => ({ teachers: teacherSvc.listTeachers() }));
router.post('/api/teachers', (ctx) => ({ teacher: teacherSvc.createTeacher(ctx.body) }));
router.put('/api/teachers/:id', (ctx) => ({ teacher: teacherSvc.updateTeacher(num(ctx.params.id), ctx.body) }));
router.delete('/api/teachers/:id', (ctx) => teacherSvc.deleteTeacher(num(ctx.params.id)));

// 강사 규칙
router.get('/api/teachers/:id/rules', (ctx) => ({ rules: rulesSvc.getTeacherRules(getDb(), num(ctx.params.id)) }));
router.put('/api/teachers/:id/rules', (ctx) => ({ rules: rulesSvc.updateTeacherRules(num(ctx.params.id), ctx.body) }));

// 학교
router.get('/api/teachers/:id/schools', (ctx) => ({ schools: teacherSvc.listSchools(num(ctx.params.id)) }));
router.post('/api/teachers/:id/schools', (ctx) => ({ school: teacherSvc.createSchool(num(ctx.params.id), ctx.body) }));
router.delete('/api/schools/:id', (ctx) => teacherSvc.deleteSchool(num(ctx.params.id)));

// 분반
router.get('/api/teachers/:id/classes', (ctx) => ({ classes: studentSvc.listClasses(num(ctx.params.id)) }));

// 의의 및 규칙
router.get('/api/teachers/:id/guide', (ctx) => ({ guide: teacherSvc.getGuide(num(ctx.params.id)) }));
router.put('/api/teachers/:id/guide', (ctx) => ({ guide: teacherSvc.updateGuide(num(ctx.params.id), ctx.body.content) }));
router.get('/api/teachers/:id/guide/draft', (ctx) => ({ draft: teacherSvc.generateGuideDraft(num(ctx.params.id)) }));

// ---- 학생 ----
router.get('/api/students', (ctx) => {
  const q = ctx.query;
  const teacherId = q.teacher_id ? num(q.teacher_id) : null;
  return {
    students: studentSvc.listStudents(teacherId, {
      scope: q.scope,
      teacherId: q.teacher_id,
      school: q.school,
      className: q.class_name,
      level: q.level,
      grade: q.grade,
      name: q.name,
      sort: q.sort,
    }),
  };
});
router.post('/api/students', (ctx) => ({ student: studentSvc.createStudent(ctx.body) }));
router.get('/api/students/:id', (ctx) => ({ student: studentSvc.getStudent(num(ctx.params.id)) }));
router.put('/api/students/:id', (ctx) => ({ student: studentSvc.updateStudent(num(ctx.params.id), ctx.body) }));
router.get('/api/students/:id/deletion-impact', (ctx) => studentSvc.getStudentDeletionImpact(num(ctx.params.id)));
router.delete('/api/students/:id', (ctx) => studentSvc.deleteStudent(num(ctx.params.id)));

// 학생 상세 (전환 시 단일 호출)
router.get('/api/students/:id/detail', (ctx) => detailSvc.getStudentDetail(num(ctx.params.id)));

// 학생 예외 규칙
router.get('/api/students/:id/rules', (ctx) => ({ override: rulesSvc.getStudentOverride(getDb(), num(ctx.params.id)) }));
router.put('/api/students/:id/rules', (ctx) => ({ override: rulesSvc.updateStudentOverride(num(ctx.params.id), ctx.body) }));

// 장부
router.get('/api/students/:id/ledger', (ctx) => ({ ledger: getLedger(getDb(), num(ctx.params.id)) }));

// 수동 CP
router.post('/api/students/:id/manual-cp', (ctx) => ({ entry: manualSvc.grantManualCp(num(ctx.params.id), ctx.body) }));
router.delete('/api/ledger/:id', (ctx) => manualSvc.deleteManualCp(num(ctx.params.id)));

// ---- 수업 ----
router.get('/api/students/:id/lessons', (ctx) => ({ lessons: lessonSvc.listLessons(num(ctx.params.id)) }));
router.post('/api/students/:id/lessons', (ctx) => ({ lesson: lessonSvc.createLesson(num(ctx.params.id), ctx.body) }));
router.put('/api/lessons/:id', (ctx) => ({ lesson: lessonSvc.updateLesson(num(ctx.params.id), ctx.body) }));
router.delete('/api/lessons/:id', (ctx) => lessonSvc.deleteLesson(num(ctx.params.id)));

// ---- 시험 ----
router.get('/api/students/:id/exams', (ctx) => ({ exams: examSvc.listExams(num(ctx.params.id)) }));
router.post('/api/students/:id/exams', (ctx) => ({ exam: examSvc.createExam(num(ctx.params.id), ctx.body) }));
router.put('/api/exams/:id', (ctx) => ({ exam: examSvc.updateExam(num(ctx.params.id), ctx.body) }));
router.delete('/api/exams/:id', (ctx) => examSvc.deleteExam(num(ctx.params.id)));
router.get('/api/students/:id/exam-analysis', (ctx) => examSvc.analyzeExams(num(ctx.params.id)));

// ---- AI 코치 ----
router.get('/api/students/:id/coach', (ctx) => coachSvc.coachAnalyze(num(ctx.params.id)));

// ---- 참여 리모콘 ----
router.get('/api/participation', (ctx) => ({
  students: partSvc.getParticipation(num(ctx.query.teacher_id), ctx.query.class_name, ctx.query.lesson_date),
}));
router.post('/api/students/:id/participation', (ctx) => ({
  result: partSvc.adjustParticipation(num(ctx.params.id), ctx.body),
}));

// ---- 월간 보너스 ----
router.get('/api/students/:id/bonuses', (ctx) => ({ bonuses: bonusSvc.listMonthlyBonuses(num(ctx.params.id)) }));
router.post('/api/students/:id/bonuses/:month', (ctx) =>
  ({ bonus: bonusSvc.computeAndSaveMonthlyBonus(num(ctx.params.id), ctx.params.month) }));
router.put('/api/students/:id/bonuses/:month', (ctx) =>
  ({ bonus: bonusSvc.adjustMonthlyBonus(num(ctx.params.id), ctx.params.month, ctx.body.manual_adjust) }));
router.delete('/api/students/:id/bonuses/:month', (ctx) =>
  bonusSvc.removeMonthlyBonus(num(ctx.params.id), ctx.params.month));

// ---- 상점 ----
router.get('/api/teachers/:id/products', (ctx) => ({ products: shopSvc.listProducts(num(ctx.params.id)) }));
router.post('/api/teachers/:id/products', (ctx) => ({ product: shopSvc.createProduct(num(ctx.params.id), ctx.body) }));
router.put('/api/products/:id', (ctx) => ({ product: shopSvc.updateProduct(num(ctx.params.id), ctx.body) }));
router.post('/api/products/:id/end', (ctx) => ({ product: shopSvc.endProduct(num(ctx.params.id)) }));
router.get('/api/students/:id/products', (ctx) => {
  const s = studentSvc.getStudent(num(ctx.params.id));
  return { products: shopSvc.listProductsForStudent(s.teacher_id, s.id) };
});
router.put('/api/students/:sid/products/:pid/price', (ctx) =>
  ({ result: shopSvc.setStudentPrice(num(ctx.params.sid), num(ctx.params.pid), ctx.body.cp_price) }));

// 이미지 업로드
router.post('/api/upload', (ctx) => ({ url: uploadSvc.saveImageDataUrl(ctx.body.dataUrl) }));

// ---- 구매/인벤토리 ----
router.post('/api/students/:id/purchase', (ctx) => ({ purchase: shopSvc.purchase(num(ctx.params.id), num(ctx.body.product_id)) }));
router.get('/api/teachers/:id/purchases', (ctx) =>
  ({ purchases: shopSvc.listPurchases(num(ctx.params.id), ctx.query.student_id ? num(ctx.query.student_id) : null) }));
router.get('/api/students/:id/inventory', (ctx) => ({ inventory: shopSvc.listInventory(num(ctx.params.id)) }));
router.put('/api/purchases/:id/state', (ctx) => ({ purchase: shopSvc.setInventoryState(num(ctx.params.id), ctx.body.state) }));
router.delete('/api/purchases/:id', (ctx) => shopSvc.refundPurchase(num(ctx.params.id)));

// ---- 랭킹 ----
router.get('/api/teachers/:id/ranking', (ctx) =>
  rankSvc.getRanking(num(ctx.params.id), {
    basis: ctx.query.basis || 'cumulative',
    filter: { level: ctx.query.level, school: ctx.query.school, className: ctx.query.class_name, grade: ctx.query.grade },
  }));
router.post('/api/teachers/:id/quarter-titles/confirm', (ctx) =>
  rankSvc.confirmQuarterTitles(num(ctx.params.id), { force: !!ctx.body.force }));
router.get('/api/teachers/:id/quarter-titles', (ctx) => ({ titles: rankSvc.listQuarterTitles(num(ctx.params.id)) }));

// ---- 백업/복원 ----
router.get('/api/backup/export', (ctx) => backupSvc.exportData(ctx.query.teacher_id ? num(ctx.query.teacher_id) : null));
router.post('/api/backup/compare', (ctx) =>
  backupSvc.compareData(ctx.body.payload, ctx.body.teacher_id ? num(ctx.body.teacher_id) : null));
router.post('/api/backup/import', (ctx) =>
  backupSvc.importData(ctx.body.payload, {
    confirm: !!ctx.body.confirm,
    scope: ctx.body.scope || 'all',
    teacherId: ctx.body.teacher_id ? num(ctx.body.teacher_id) : null,
  }));
router.get('/api/backup/list', () => ({ backups: backupSvc.listBackups() }));

export default router;
