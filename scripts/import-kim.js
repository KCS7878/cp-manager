// 김승운 강사 + 3학생(송명헌/김하언/이지원) 데이터를 서비스로 재현하고 백업 JSON 생성.
// PDF 리포트(2026-07-31 ~ 2026-10-09) 기준. 서비스가 CP 장부를 자동 생성하므로
// 규칙을 PDF에 맞춘 뒤(통과 90점 등) 수업/시험/보너스/구매/수동CP를 입력한다.
//
// 사용: node --experimental-sqlite scripts/import-kim.js
// 결과: backups/kim-seungwoon-import.json  (사이트 "백업 → 불러오기"로 복원)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initLocalDb, getDb, closeDb } from '../server/db/connection.js';
import { runMigrations } from '../server/db/migrate.js';
import { createTeacher } from '../server/services/teacher-service.js';
import { updateTeacherRules } from '../server/services/rules-service.js';
import { createStudent } from '../server/services/student-service.js';
import { createLesson } from '../server/services/lesson-service.js';
import { createExam } from '../server/services/exam-service.js';
import { grantManualCp } from '../server/services/manual-cp-service.js';
import { computeAndSaveMonthlyBonus } from '../server/services/bonus-service.js';
import { createProduct, purchase, setInventoryState } from '../server/services/shop-service.js';
import { exportData } from '../server/services/backup-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 별도 임시 DB에 구성 (현재 운영 DB를 건드리지 않음)
process.env.CP_DB_PATH = path.resolve(__dirname, '../data/kim-import-build.db');
for (const s of ['', '-wal', '-shm']) { const f = process.env.CP_DB_PATH + s; if (fs.existsSync(f)) fs.rmSync(f); }

// 단어시험 행 파서: PDF "전체 수업·단어시험 기록"의 한 줄을 createLesson body로 변환.
// wordText 예: "90점 / 오답 12", "98.3점", "미응시", "100점 / 오답 0"
// mode: 'count'(오답 수 존재) | 'score'(점수만). 미응시는 noshow.
function lessonBody(date, attendance, lateMin, wordText, range, deadline) {
  const b = { lesson_date: date, attendance, word_range: range };
  if (attendance === 'late') b.late_minutes = lateMin;
  if (wordText === '미응시') {
    b.word_status = 'noshow';
    return b;
  }
  b.word_status = 'taken';
  b.deadline_met = deadline; // 1=준수, 0=초과
  const wrongMatch = /오답\s*(\d+)/.exec(wordText);
  const scoreMatch = /([\d.]+)\s*점/.exec(wordText);
  if (wrongMatch) {
    // 개수제: 100문항 기준으로 점수가 (100-오답)과 일치하도록 seen=100 가정은 위험.
    // PDF는 "N점 / 오답 K" 형태 → 점수는 명시된 값을 그대로 쓰되, 개수 환산이 필요.
    // 단, 학생 word_input_mode를 'score'로 두면 점수를 그대로 저장 가능(환산 불필요).
    b.word_score = Math.round(parseFloat(scoreMatch[1]));
  } else {
    b.word_score = Math.round(parseFloat(scoreMatch[1]));
  }
  return b;
}

async function main() {
  await initLocalDb();
  await runMigrations();

  // 1) 강사 + 규칙 (PDF 공통 규칙: 통과 90점)
  const kim = await createTeacher({ name: '김승운', color: '#ee735a' });
  await updateTeacherRules(kim.id, {
    word_pass_score: 90,
    pass_in_time_cp: 10,
    perfect_bonus_cp: 5,
    pass_late_cp: -5,
    no_show_cp: -10,
    late_grace_min: 0,  // PDF: 14분→-14, 5분→-5, 10분→-10 (전체 분 차감)
    late_penalty_per_min: 1,
    monthly_no_late_bonus: 30,
    monthly_word_bonus: 30,
    participation_stack3_cp: 5,
  });

  // 상품 (PDF 구매내역 기반)
  const cafeCoupon = await createProduct(kim.id, { name: '카페 음료 쿠폰', base_cp: 100, price_krw: 5000, status: 'active' });
  const exitPass = await createProduct(kim.id, { name: '수업 이탈권', base_cp: 10, price_krw: 5000, status: 'active' });

  // 공통: 학생은 점수제로 생성(PDF 점수를 그대로 저장, 환산 불필요)
  const base = { teacher_id: kim.id, school: '대진고', school_level: 'high', subject: '영어', word_input_mode: 'score', exam_goal_type: 'grade', exam_goal_value: '1' };

  // ============ 송명헌 ============
  const song = await createStudent({
    ...base, name: '송명헌', grade: '고1', class_name: '고1반', age: 17,
    mock_goal_type: 'grade', mock_goal_value: '1',
  });
  // 수업·단어시험 (PDF p3-4) — [날짜, 출결, 지각분, 단어, 범위, 기한(1준수/0초과)]
  const songLessons = [
    ['2026-10-09', 'present', 0, '미응시', 'Day 38-40', 1],
    ['2026-10-07', 'present', 0, '미응시', 'Day 37-38', 1],
    ['2026-10-05', 'present', 0, '90점', 'Day 36-38', 1],
    ['2026-10-02', 'present', 0, '96점', 'Day 35-37', 1],
    ['2026-09-30', 'present', 0, '91점', 'Day 34-36', 1],
    ['2026-09-23', 'present', 0, '91점', 'Day 33-35', 1],
    ['2026-09-21', 'present', 0, '95점', 'Day 32-34', 1],
    ['2026-09-18', 'present', 0, '95점', 'Day 31-33', 1],
    ['2026-09-16', 'present', 0, '92점', 'Day 30-32', 1],
    ['2026-09-14', 'present', 0, '95점', 'Day 29-31', 1],
    ['2026-09-11', 'present', 0, '미응시', 'Day 29-30', 1],
    ['2026-09-09', 'present', 0, '100점', 'Day 29', 1],
    ['2026-09-07', 'present', 0, '미응시', 'Day 19-20', 1],
    ['2026-09-04', 'present', 0, '미응시', 'Day 19', 1],
    ['2026-09-02', 'present', 0, '98점', 'Day 26-29', 1],
    ['2026-08-31', 'present', 0, '96점', 'Day 25-28', 0],
    ['2026-08-28', 'present', 0, '100점', 'Day 24-27', 1],
    ['2026-08-26', 'present', 0, '97점', 'Day 23-26', 1],
    ['2026-08-24', 'present', 0, '95점', 'Day 22-25', 1],
    ['2026-08-21', 'present', 0, '100점', 'Day 21-24', 1],
    ['2026-08-19', 'present', 0, '100점', 'Day 20-23', 1],
    ['2026-08-17', 'present', 0, '98점', 'Day 19-22', 1],   // 98.3 → 98
    ['2026-08-14', 'present', 0, '95점', 'Day 18-21', 1],
    ['2026-08-12', 'present', 0, '98점', 'Day 17-20', 0],   // 97.5 → 98
    ['2026-08-10', 'present', 0, '100점', 'Day 16-19', 1],
    ['2026-08-05', 'present', 0, '99점', 'Day 15-17', 1],   // 99.2 → 99
    ['2026-08-03', 'present', 0, '94점', 'Day 14-17', 0],   // 94.2 → 94
    ['2026-07-31', 'present', 0, '100점', 'Day 13-16', 1],
  ];
  for (const r of songLessons) await createLesson(song.id, lessonBody(...r));
  // 메모(일부 수업에 진도/약점/숙제) — 대표 3건
  await createLesson; // noop
  // 시험 (내신 2건)
  await createExam(song.id, { exam_type: 'school', exam_name: '1학기 기말', exam_date: '2026-08-07', score: 65 });
  await createExam(song.id, { exam_type: 'school', exam_name: '1학기 중간', exam_date: '2026-08-07', score: 78 });
  // 수동 CP (PDF 장부: 숙제 미흡 -10 x2, 07/26 대기 전환 +105)
  await grantManualCp(song.id, { amount: -10, reason: '08/28 천일문 숙제 미흡', occurred_date: '2026-08-28', immediate: true });
  await grantManualCp(song.id, { amount: -10, reason: '08/21 숙제 미흡', occurred_date: '2026-08-21', immediate: true });
  await grantManualCp(song.id, { amount: 105, reason: '07/26 대기 CP 전환', occurred_date: '2026-08-04', immediate: true });
  // 월간 보너스 (08, 09 무지각)
  await computeAndSaveMonthlyBonus(song.id, '2026-08');
  await computeAndSaveMonthlyBonus(song.id, '2026-09');

  // ============ 김하언 ============
  const kimha = await createStudent({
    ...base, name: '김하언', grade: '고3', class_name: '고3반', age: 19,
    mock_goal_type: 'grade', mock_goal_value: '3',
  });
  const kimhaLessons = [
    ['2026-10-09', 'present', 0, '92점', 'Day 59-60', 1],
    ['2026-10-07', 'present', 0, '95점', 'Day 59', 1],
    ['2026-10-05', 'present', 0, '94점', 'Day 58-59', 0],
    ['2026-10-02', 'present', 0, '91점', 'Day 57-59', 0],
    ['2026-09-30', 'present', 0, '91점', 'Day 56-59', 1],
    ['2026-09-23', 'present', 0, '98점', 'Day 55-58', 1],
    ['2026-09-21', 'present', 0, '95점', 'Day 54-57', 1],
    ['2026-09-18', 'present', 0, '93점', 'Day 53-56', 1],
    ['2026-09-14', 'present', 0, '95점', 'Day 54-56', 0],
    ['2026-09-11', 'present', 0, '86점', 'Day 52-55', 1], // 미통과(90미만) → PDF CP +0
    ['2026-09-09', 'late', 5, '91점', 'Day 51-54', 0],    // 지각5분(인정) + 기한후통과 -5
    ['2026-09-07', 'present', 0, '92점', 'Day 50-53', 0],
    ['2026-09-04', 'late', 14, '92점', 'Day 49-52', 1],   // 지각14분 → -9? PDF는 -14. 아래 설명 참조
    ['2026-09-02', 'present', 0, '미응시', 'Day 48-51', 1],
    ['2026-08-31', 'present', 0, '미응시', 'Day 47-50', 1],
    ['2026-08-28', 'present', 0, '93점', 'Day 46-49', 1],
    ['2026-08-26', 'present', 0, '96점', 'Day 45-48', 1],
    ['2026-08-24', 'present', 0, '92점', 'Day 44-47', 0],
    ['2026-08-21', 'present', 0, '미응시', 'Day 43-46', 1],
    ['2026-08-19', 'present', 0, '90점', 'Day 42-45', 1],
    ['2026-08-17', 'present', 0, '95점', 'Day 41-44', 1],  // 95.3 → 95
    ['2026-08-14', 'present', 0, '91점', 'Day 40-43', 1],  // 90.5 → 91
    ['2026-08-12', 'present', 0, '93점', 'Day 39-40', 1], // 93.1 → 93
    ['2026-08-10', 'present', 0, '91점', 'Day 38-41', 0],  // 91.2 → 91
    ['2026-08-05', 'present', 0, '92점', 'Day 37-40', 1],  // 91.5 → 92
    ['2026-08-03', 'present', 0, '95점', 'Day 36-39', 1],  // 94.6 → 95
    ['2026-07-31', 'present', 0, '92점', 'Day 35-38', 0],  // 91.5 → 92
  ];
  for (const r of kimhaLessons) await createLesson(kimha.id, lessonBody(...r));
  // 모의고사 (문항 27개 입력, 정답15/오답12)
  const kimhaItems = {};
  // PDF: 정답 15 / 오답 12 (27개 입력). 유형 상세 미제공 → 앞 15 정답, 뒤 12 오답으로 근사
  for (let i = 1; i <= 27; i++) kimhaItems[i] = i <= 15 ? 'o' : 'x';
  await createExam(kimha.id, {
    exam_type: 'mock', exam_name: '2026 고3 9월 모의고사', exam_date: '2026-09-02', score: 66, grade: '4',
    weakness: '주장/요지/주제/제목 유형 미흡, 장문 미흡(집중력?), 요약문 미흡, 어법 미흡',
    feedback: '빈칸 & 문장삽입 럭키히트로 3등급 가능성이 있었으나 듣기1·제목·요약문·장문1에서 실점해 4등급(66점). 안 되는 유형(빈칸/순서/문장삽입)은 과감히 버리고 맞출 수 있는 문제에 공격적으로 집중 필요.',
    items: kimhaItems,
  });
  // 수동: 07/26 대기 전환 +140
  await grantManualCp(kimha.id, { amount: 140, reason: '07/26 대기 CP 전환', occurred_date: '2026-08-04', immediate: true });
  // 월간 보너스: 08월만 무지각(09월은 지각 있음 → 08만). PDF 장부에 08 무지각 +30만 존재.
  await computeAndSaveMonthlyBonus(kimha.id, '2026-08');
  // 상품 구매: 카페 음료 쿠폰 100 CP (09-11), 사용완료(10-09)
  const kimhaBuy = await purchase(kimha.id, cafeCoupon.id);
  await setInventoryState(kimhaBuy.id, 'used');

  // ============ 이지원 ============
  const lee = await createStudent({
    ...base, name: '이지원', grade: '고3', class_name: '고3반', age: 19,
    mock_goal_type: 'grade', mock_goal_value: '2',
  });
  const leeLessons = [
    ['2026-10-09', 'present', 0, '미응시', 'Day 59-60', 1],
    ['2026-10-07', 'present', 0, '미응시', 'Day 59', 1],
    ['2026-10-05', 'present', 0, '미응시', 'Day 58-59', 1],
    ['2026-10-02', 'present', 0, '미응시', 'Day 57-59', 1],
    ['2026-09-30', 'present', 0, '미응시', 'Day 56-59', 1],
    ['2026-09-23', 'present', 0, '미응시', 'Day 55-58', 1],
    ['2026-09-18', 'present', 0, '미응시', 'Day 53-56', 1],
    ['2026-09-14', 'present', 0, '95점', 'Day 29-31', 1],
    ['2026-09-11', 'present', 0, '미응시', 'Day 29-30', 1],
    ['2026-09-09', 'present', 0, '100점', 'Day 29', 1],
    ['2026-09-07', 'present', 0, '미응시', 'Day 50-53', 1],
    ['2026-09-04', 'present', 0, '미응시', 'Day 49-52', 1],
    ['2026-09-02', 'present', 0, '미응시', 'Day 48-51', 1],
    ['2026-08-31', 'present', 0, '미응시', 'Day 47-50', 1],
    ['2026-08-28', 'present', 0, '94점', 'Day 46-49', 1],
    ['2026-08-26', 'present', 0, '93점', 'Day 45-48', 1],
    ['2026-08-24', 'present', 0, '93점', 'Day 44-47', 0],
    ['2026-08-21', 'present', 0, '91점', 'Day 43-46', 1],
    ['2026-08-19', 'late', 10, '90점', 'Day 42-45', 0],
    ['2026-08-17', 'present', 0, '85점', 'Day 41-44', 1], // 미통과(90미만) → PDF CP +0
    ['2026-08-14', 'present', 0, '미응시', 'Day 40-43', 1],
    ['2026-08-12', 'present', 0, '93점', 'Day 39-42', 1], // 93.1
    ['2026-08-10', 'present', 0, '96점', 'Day 38-41', 0], // 95.6
    ['2026-08-05', 'present', 0, '92점', 'Day 37-40', 1], // 91.5
    ['2026-08-03', 'present', 0, '92점', 'Day 36-39', 0], // 91.8
    ['2026-07-31', 'present', 0, '92점', 'Day 35-38', 0], // 91.5
  ];
  for (const r of leeLessons) await createLesson(lee.id, lessonBody(...r));
  // 수동: 07/26 대기 전환 +125
  await grantManualCp(lee.id, { amount: 125, reason: '07/26 대기 CP 전환', occurred_date: '2026-08-04', immediate: true });
  // 월간 보너스: 09월 무지각 +30 (PDF). 08월은 08-19 지각 → 제외.
  await computeAndSaveMonthlyBonus(lee.id, '2026-09');
  // 상품 구매: 수업 이탈권 10 CP (09-09), 사용완료(10-09)
  const leeBuy = await purchase(lee.id, exitPass.id);
  await setInventoryState(leeBuy.id, 'used');

  // ============ 백업 JSON 내보내기 ============
  const data = await exportData(kim.id);
  const outDir = path.resolve(__dirname, '../backups');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'kim-seungwoon-import.json');
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf8');

  // 검증용 잔액 출력
  const db = getDb();
  for (const sid of [song.id, kimha.id, lee.id]) {
    const nm = (await db.get('SELECT name FROM students WHERE id=?', [sid])).name;
    const av = (await db.get("SELECT COALESCE(SUM(amount),0) v FROM cp_ledger WHERE student_id=? AND status='available'", [sid])).v;
    const pd = (await db.get("SELECT COALESCE(SUM(amount),0) v FROM cp_ledger WHERE student_id=? AND status='pending'", [sid])).v;
    const cum = (await db.get("SELECT COALESCE(SUM(amount),0) v FROM cp_ledger WHERE student_id=? AND source_type!='purchase'", [sid])).v;
    const tot = (await db.get("SELECT COALESCE(SUM(amount),0) v FROM cp_ledger WHERE student_id=?", [sid])).v;
    console.log(`${nm}: 사용가능 ${av} / 대기 ${pd} / 성과누적 ${cum} / 현재총액 ${tot}`);
  }
  console.log('\n[완료] 백업 파일:', outFile);
  console.log('PDF 목표치: 송명헌 310/+0/310/310, 김하언 121/+10/231/131, 이지원 95/-40/65/55');
  closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
