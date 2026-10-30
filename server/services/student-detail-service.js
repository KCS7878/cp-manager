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
  // 서로 독립적인 집계들은 병렬 실행 (직렬 대기 제거 → 특히 D1에서 체감 개선)
  const [
    override, effectiveRules, ledger, lessons, exams,
    examAnalysis, monthlyBonuses, inventory, purchaseRequests,
  ] = await Promise.all([
    getStudentOverride(db, studentId),
    getEffectiveRules(db, student.teacher_id, studentId),
    getLedger(db, studentId),
    listLessons(studentId),
    listExams(studentId),
    analyzeExams(studentId),
    listMonthlyBonuses(studentId),
    listInventory(studentId),
    listPurchaseRequests(null, studentId), // 학생 구매 희망(승인 대기)
  ]);
  return { student, override, effectiveRules, ledger, lessons, exams, examAnalysis, monthlyBonuses, inventory, purchaseRequests };
}
