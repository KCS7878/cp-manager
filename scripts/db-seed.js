// 샘플 데이터 시드. 실제 기능 시연용 (삭제/수정 가능).
import { getDb, transaction } from '../server/db/connection.js';
import { runMigrations } from '../server/db/migrate.js';
import { createTeacher, createSchool } from '../server/services/teacher-service.js';
import { createStudent } from '../server/services/student-service.js';
import { createLesson } from '../server/services/lesson-service.js';
import { createExam } from '../server/services/exam-service.js';
import { createProduct } from '../server/services/shop-service.js';
import { grantManualCp } from '../server/services/manual-cp-service.js';
import { computeAndSaveMonthlyBonus } from '../server/services/bonus-service.js';
import { prevMonthKey, currentMonthKey } from '../server/lib/time.js';

runMigrations();

const db = getDb();
const existing = db.prepare('SELECT COUNT(*) c FROM teachers').get().c;
if (existing > 0) {
  console.log('[db:seed] 이미 데이터가 있어 시드를 건너뜁니다.');
  process.exit(0);
}

const pm = prevMonthKey(currentMonthKey()); // 지난달 (완료된 월)

// 강사
const kim = createTeacher({ name: '김영어', color: '#ee735a' });
const lee = createTeacher({ name: '이보카', color: '#e7a84d' });

// 학교
createSchool(kim.id, { name: '한빛중학교', level: 'middle' });
createSchool(kim.id, { name: '세종고등학교', level: 'high' });

// 학생 (김영어 담당)
const s1 = createStudent({
  teacher_id: kim.id, name: '박지민', school: '세종고등학교', school_level: 'high',
  grade: '고2', class_name: '고2 심화반', age: 17, word_input_mode: 'count',
  mock_goal_type: 'grade', mock_goal_value: '2등급', exam_goal_type: 'score', exam_goal_value: '90',
});
const s2 = createStudent({
  teacher_id: kim.id, name: '최수아', school: '세종고등학교', school_level: 'high',
  grade: '고2', class_name: '고2 심화반', age: 17, word_input_mode: 'score',
  mock_goal_type: 'score', mock_goal_value: '85',
});
const s3 = createStudent({
  teacher_id: kim.id, name: '정도윤', school: '한빛중학교', school_level: 'middle',
  grade: '중3', class_name: '중3 A반', age: 15, word_input_mode: 'count',
});

// 지난달 수업 기록 (박지민: 성실 - 무지각 + 단어 모두 기한내 통과)
createLesson(s1.id, { lesson_date: `${pm}-05`, attendance: 'present', word_status: 'taken', word_range: 'Day 1~2', word_seen: 40, word_wrong: 2, deadline_met: 1, progress_rate: 30, homework: 'Day 3 암기' });
createLesson(s1.id, { lesson_date: `${pm}-12`, attendance: 'present', word_status: 'taken', word_range: 'Day 3~4', word_seen: 40, word_wrong: 0, deadline_met: 1, progress_rate: 45, weakness: '빈칸 유형' });
createLesson(s1.id, { lesson_date: `${pm}-19`, attendance: 'present', word_status: 'taken', word_range: 'Day 5~6', word_seen: 40, word_wrong: 4, deadline_met: 1, progress_rate: 60 });

// 최수아: 지각 + 미응시 (보너스 제외 케이스)
createLesson(s2.id, { lesson_date: `${pm}-06`, attendance: 'late', late_minutes: 12, word_status: 'taken', word_score: 70, deadline_met: 1, word_range: 'Unit 1' });
createLesson(s2.id, { lesson_date: `${pm}-13`, attendance: 'present', word_status: 'noshow', word_range: 'Unit 2' });
createLesson(s2.id, { lesson_date: `${pm}-20`, attendance: 'present', word_status: 'taken', word_score: 95, deadline_met: 1, word_range: 'Unit 3' });

// 정도윤: 첫 수업 '기타', 이후 만점
createLesson(s3.id, { lesson_date: `${pm}-07`, attendance: 'present', word_status: 'etc', word_etc_reason: '첫 수업, 시험 범위 미지정', word_range: '' });
createLesson(s3.id, { lesson_date: `${pm}-14`, attendance: 'present', word_status: 'taken', word_range: 'Day 1', word_seen: 30, word_wrong: 0, deadline_met: 1 });
createLesson(s3.id, { lesson_date: `${pm}-21`, attendance: 'present', word_status: 'taken', word_range: 'Day 2', word_seen: 30, word_wrong: 0, deadline_met: 1 });

// 시험 기록 (박지민 모의고사 - 문항별)
const items = {};
for (let i = 1; i <= 45; i++) {
  // 듣기/초반은 대체로 정답, 빈칸(31-34)/어법(29)은 오답 많게
  if ([29, 31, 32, 33, 34, 38].includes(i)) items[String(i)] = Math.random() < 0.4 ? 'o' : 'x';
  else items[String(i)] = Math.random() < 0.85 ? 'o' : 'x';
}
createExam(s1.id, { exam_type: 'mock', exam_name: `${pm} 모의고사`, exam_date: `${pm}-15`, score: 78, grade: '3', items, strengths: '듣기 안정적', weakness: '빈칸·어법', feedback: '빈칸 추론 연습 필요' });
createExam(s1.id, { exam_type: 'school', exam_name: '1학기 중간고사', exam_date: `${pm}-10`, score: 85, grade: '2', strengths: '독해', weakness: '서술형' });

// 상품
createProduct(kim.id, { name: '편의점 상품권 5천원', description: '원하는 간식 구매', base_cp: 50, price_krw: 5000, status: 'active' });
createProduct(kim.id, { name: '숙제 1회 면제권', description: '숙제 한 번 쉬어가기', base_cp: 30, status: 'active' });
createProduct(kim.id, { name: '문화상품권 1만원', description: '', base_cp: 100, price_krw: 10000, status: 'active' });

// 즉시 가용 CP 수동 지급 (상점 구매 시연용)
grantManualCp(s1.id, { amount: 80, reason: '시즌 오픈 보너스', immediate: true });
grantManualCp(s3.id, { amount: 60, reason: '시즌 오픈 보너스', immediate: true });

// 지난달 월간 보너스 계산
computeAndSaveMonthlyBonus(s1.id, pm);
computeAndSaveMonthlyBonus(s2.id, pm);
computeAndSaveMonthlyBonus(s3.id, pm);

console.log('[db:seed] 샘플 데이터 생성 완료');
console.log(`  - 강사: 김영어(${kim.id}), 이보카(${lee.id})`);
console.log(`  - 학생: 박지민(${s1.id}), 최수아(${s2.id}), 정도윤(${s3.id})`);
console.log(`  - 지난달(${pm}) 보너스 계산 완료`);
