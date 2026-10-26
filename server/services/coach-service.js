// AI 학습 코치 서비스 (요구사항 10절).
// 규칙 기반 분석이 기본. 외부 AI API가 설정되면 서버에서 호출(키는 서버에만).
// 분석은 반드시 실제 기록에 근거하며, 근거 부족 시 명시한다.
import { getDb } from '../db/connection.js';
import { currentMonthKey, monthRange, prevMonthKey } from '../lib/time.js';
import { analyzeExams } from './exam-service.js';
import { NotFoundError } from '../lib/validation.js';

/**
 * 반환 구조(프런트에서 색상/스타일 적용):
 * {
 *   facts: [ { text, cite } ],       // 1. 기록에서 확인되는 사실
 *   problems: [ { text } ],          // 2. 현재 문제 상황
 *   plan: [ { text } ],              // 3. 해결 설계
 *   actions: [ { text } ],           // 4. 다음 수업 추천 행동
 *   wordTrend: {...},
 *   examAnalysis: {...},
 *   insufficient: bool, needData: [...]
 * }
 */
export function coachAnalyze(studentId) {
  const db = getDb();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) throw new NotFoundError('학생을 찾을 수 없습니다.');

  const lessons = db
    .prepare('SELECT * FROM lessons WHERE student_id = ? ORDER BY lesson_date ASC, id ASC')
    .all(studentId);
  const exams = analyzeExams(studentId);

  const facts = [];
  const problems = [];
  const plan = [];
  const actions = [];
  const needData = [];

  // --- 단어시험 추세 ---
  const wordLessons = lessons.filter((l) => l.word_status === 'taken');
  const noShowLessons = lessons.filter((l) => l.word_status === 'noshow');
  const lateDeadline = wordLessons.filter((l) => !l.deadline_met);
  const recentWord = wordLessons.slice(-5);
  const avgScore = wordLessons.length
    ? Math.round(wordLessons.reduce((a, l) => a + (l.word_score || 0), 0) / wordLessons.length)
    : null;

  let wordTrend = { count: wordLessons.length, avgScore, recent: recentWord.map((l) => ({ date: l.lesson_date, score: l.word_score, range: l.word_range, deadlineMet: !!l.deadline_met })) };

  if (wordLessons.length > 0) {
    facts.push({ text: `단어시험 ${wordLessons.length}회 응시, 평균 ${avgScore}점.`, cite: null });
    if (recentWord.length >= 2) {
      const first = recentWord[0].word_score || 0;
      const last = recentWord[recentWord.length - 1].word_score || 0;
      if (last < first - 5) {
        problems.push({ text: `최근 단어시험 점수가 ${first}점에서 ${last}점으로 하락했습니다.` });
        plan.push({ text: `하락 구간의 단어 범위(${recentWord[recentWord.length - 1].word_range || '범위 미기재'})를 재시험으로 보강하는 설계가 필요합니다.` });
        actions.push({ text: `다음 수업에 직전 범위 재시험을 실시하세요.` });
      } else if (last >= first + 5) {
        facts.push({ text: `최근 단어시험이 ${first}점에서 ${last}점으로 상승 추세입니다.`, cite: recentWord[recentWord.length - 1].word_range });
      }
    }
  } else {
    needData.push('단어시험 응시 기록');
  }

  if (noShowLessons.length > 0) {
    problems.push({ text: `단어시험 미응시가 ${noShowLessons.length}회 있습니다. (CP 차감 및 월간 보너스 제외 사유)` });
    actions.push({ text: `미응시가 반복되지 않도록 시험 범위와 일정을 사전에 공유하세요.` });
  }
  if (lateDeadline.length > 0) {
    problems.push({ text: `마감 기한 초과 응시가 ${lateDeadline.length}회 있습니다.` });
    plan.push({ text: `숙제/시험 마감 리마인더 체계를 마련해 기한 준수율을 높이는 설계가 필요합니다.` });
  }

  // --- 출결 ---
  const lateLessons = lessons.filter((l) => l.attendance === 'late');
  const absentLessons = lessons.filter((l) => l.attendance === 'absent');
  if (lateLessons.length > 0) {
    facts.push({ text: `지각 ${lateLessons.length}회 기록이 있습니다.`, cite: null });
    if (lateLessons.length >= 2) problems.push({ text: `지각이 ${lateLessons.length}회로 반복되고 있습니다.` });
  }
  if (absentLessons.length > 0) {
    problems.push({ text: `결석이 ${absentLessons.length}회 있습니다.` });
  }

  // --- 이번 달 상태 ---
  const mk = currentMonthKey();
  const { start, end } = monthRange(mk);
  const thisMonthLessons = lessons.filter((l) => l.lesson_date >= start && l.lesson_date <= end);
  if (thisMonthLessons.length > 0) {
    const noLateThisMonth = !thisMonthLessons.some((l) => l.attendance === 'late' || l.attendance === 'absent');
    if (noLateThisMonth) {
      facts.push({ text: `이번 달(${mk}) 지각·결석이 없습니다. 무지각 보너스 대상입니다.`, cite: null });
      actions.push({ text: `이번 달 무지각 흐름을 유지하도록 격려하세요.` });
    }
  }

  // --- 시험 분석 연계 ---
  if (exams.weakTypes.length > 0) {
    const names = exams.weakTypes.slice(0, 3).map((t) => `${t.type}(${t.rate}%)`).join(', ');
    problems.push({ text: `모의고사 취약 유형: ${names}.` });
    plan.push({ text: `취약 유형(${exams.weakTypes.map((t) => t.type).slice(0, 3).join(', ')}) 집중 문항 세트를 준비하는 설계가 필요합니다.` });
    actions.push({ text: `다음 수업에 ${exams.weakTypes[0].type} 유형 3~5문항을 풀게 하세요.` });
  }
  if (exams.mockTrend.length === 0 && exams.schoolTrend.length === 0) {
    needData.push('내신/모의고사 성적');
  }

  // 목표 대비
  const goalGap = [];
  const lastMock = exams.mockTrend[exams.mockTrend.length - 1];
  if (lastMock && lastMock.score != null && exams.goals.mock.type === 'score' && exams.goals.mock.value) {
    const gap = Number(exams.goals.mock.value) - lastMock.score;
    if (gap > 0) {
      problems.push({ text: `모의고사 목표 ${exams.goals.mock.value}점 대비 ${gap}점 부족합니다. (최근 ${lastMock.score}점)` });
    } else {
      facts.push({ text: `모의고사가 목표 ${exams.goals.mock.value}점을 달성/초과했습니다. (최근 ${lastMock.score}점)`, cite: null });
    }
  }

  // --- 근거 부족 처리 ---
  const insufficient = lessons.length === 0 && exams.mockTrend.length === 0 && exams.schoolTrend.length === 0;
  if (insufficient) {
    needData.push('수업/출결 기록');
  }

  if (facts.length === 0 && !insufficient) {
    facts.push({ text: '기록은 있으나 분석할 두드러진 패턴이 아직 적습니다.', cite: null });
  }
  if (problems.length === 0 && !insufficient) {
    problems.push({ text: '뚜렷한 문제 신호가 발견되지 않았습니다. 현재 흐름이 안정적입니다.' });
  }
  if (actions.length === 0 && !insufficient) {
    actions.push({ text: '현재 학습 루틴을 유지하고, 다음 단어시험 범위를 미리 공지하세요.' });
  }

  return {
    student: { id: student.id, name: student.name },
    facts,
    problems,
    plan,
    actions,
    wordTrend,
    examAnalysis: exams,
    insufficient,
    needData: [...new Set(needData)],
    source: 'rule-based', // 외부 AI 미사용 시 명시
    generatedWith: '규칙 기반 분석 (실제 기록 근거)',
  };
}
