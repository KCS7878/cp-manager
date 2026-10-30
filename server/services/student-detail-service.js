// 학생 상세 집계 (한 번의 요청으로 선택 학생의 모든 상세 기록 반환).
// 학생 전환 시 전체 대시보드가 아닌 이 엔드포인트만 호출한다.
import { getDb } from '../db/connection.js';
import { getStudent } from './student-service.js';
import { getLedger } from './ledger-service.js';
import { listLessons } from './lesson-service.js';
import { listExams, analyzeExams } from './exam-service.js';
import { listMonthlyBonuses } from './bonus-service.js';
import { listInventory, listPurchaseRequests } from './shop-service.js';
import { getStudentOverride, getEffectiveRules } from './rules-service.js';

export async function getStudentDetail(studentId) {
  const db = getDb();
  const student = await getStudent(studentId);
  return {
    student,
    override: await getStudentOverride(db, studentId),
    effectiveRules: await getEffectiveRules(db, student.teacher_id, studentId),
    ledger: await getLedger(db, studentId),
    lessons: await listLessons(studentId),
    exams: await listExams(studentId),
    examAnalysis: await analyzeExams(studentId),
    monthlyBonuses: await listMonthlyBonuses(studentId),
    inventory: await listInventory(studentId),
    purchaseRequests: await listPurchaseRequests(null, studentId), // 학생 구매 희망(승인 대기)
  };
}
