// 학생 상세 집계 (한 번의 요청으로 선택 학생의 모든 상세 기록 반환).
// 학생 전환 시 전체 대시보드가 아닌 이 엔드포인트만 호출한다.
import { getDb } from '../db/connection.js';
import { getStudent } from './student-service.js';
import { getLedger } from './ledger-service.js';
import { listLessons } from './lesson-service.js';
import { listExams, analyzeExams } from './exam-service.js';
import { listMonthlyBonuses } from './bonus-service.js';
import { listInventory } from './shop-service.js';
import { getStudentOverride } from './rules-service.js';

export function getStudentDetail(studentId) {
  const db = getDb();
  const student = getStudent(studentId);
  return {
    student,
    override: getStudentOverride(db, studentId),
    ledger: getLedger(db, studentId),
    lessons: listLessons(studentId),
    exams: listExams(studentId),
    examAnalysis: analyzeExams(studentId),
    monthlyBonuses: listMonthlyBonuses(studentId),
    inventory: listInventory(studentId),
  };
}
