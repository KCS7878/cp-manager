// CP 계산 엔진 (요구사항 6절).
// 순수 함수로 구현하여 테스트 가능하게 한다. DB 접근 없음.

/**
 * 개수제 점수 환산: 본 단어 수와 틀린 단어 수 -> 0~100 점수.
 * seen<=0 이면 0점.
 */
export function countToScore(seen, wrong) {
  const s = Number(seen) || 0;
  const w = Number(wrong) || 0;
  if (s <= 0) return 0;
  const correct = Math.max(0, s - w);
  return Math.round((correct / s) * 100);
}

/**
 * 수업 기록의 단어시험 CP를 계산한다.
 * rules: 적용 규칙(강사+학생예외 병합된 effective rules)
 * lesson: { word_status, word_score, deadline_met }
 * 반환: { amount, reason, breakdown }
 */
export function computeWordCp(rules, lesson) {
  const status = lesson.word_status;
  const passScore = rules.word_pass_score;

  if (status === 'none' || status === 'etc') {
    return { amount: 0, reason: '단어시험 CP 없음', breakdown: [] };
  }

  if (status === 'noshow') {
    return {
      amount: rules.no_show_cp,
      reason: '단어시험 미응시',
      breakdown: [{ label: '미응시', cp: rules.no_show_cp }],
    };
  }

  // status === 'taken'
  const score = Number(lesson.word_score) || 0;
  const passed = score >= passScore;
  const deadlineMet = lesson.deadline_met ? true : false;
  const breakdown = [];
  let amount = 0;

  if (!passed) {
    // 통과 못함: 기한 내든 아니든 통과 CP 없음.
    // 기한 이후면 기한초과 패널티 적용. 기한 내 미통과는 0.
    if (!deadlineMet) {
      amount += rules.pass_late_cp;
      breakdown.push({ label: '기한 초과(미통과)', cp: rules.pass_late_cp });
    } else {
      breakdown.push({ label: '기한 내 응시(미통과)', cp: 0 });
    }
    return { amount, reason: `단어시험 응시 ${score}점 (미통과)`, breakdown };
  }

  // 통과
  if (deadlineMet) {
    amount += rules.pass_in_time_cp;
    breakdown.push({ label: '기한 내 통과', cp: rules.pass_in_time_cp });
    if (score >= 100) {
      amount += rules.perfect_bonus_cp;
      breakdown.push({ label: '만점 보너스', cp: rules.perfect_bonus_cp });
    }
  } else {
    amount += rules.pass_late_cp;
    breakdown.push({ label: '기한 이후 통과', cp: rules.pass_late_cp });
  }

  return {
    amount,
    reason: `단어시험 ${score}점 통과${score >= 100 ? ' (만점)' : ''}${deadlineMet ? '' : ' (기한 초과)'}`,
    breakdown,
  };
}

/**
 * 출결(지각) CP 계산.
 * rules: { late_grace_min, late_penalty_per_min }
 * lesson: { attendance, late_minutes }
 */
export function computeAttendanceCp(rules, lesson) {
  if (lesson.attendance !== 'late') {
    return { amount: 0, reason: '', breakdown: [] };
  }
  const late = Number(lesson.late_minutes) || 0;
  const over = Math.max(0, late - rules.late_grace_min);
  if (over <= 0) {
    return {
      amount: 0,
      reason: `지각 ${late}분 (인정 범위)`,
      breakdown: [{ label: '지각(인정)', cp: 0 }],
    };
  }
  const amount = -(over * rules.late_penalty_per_min);
  return {
    amount,
    reason: `지각 ${late}분 (기준 ${rules.late_grace_min}분 초과 ${over}분)`,
    breakdown: [{ label: `지각 초과 ${over}분`, cp: amount }],
  };
}

/**
 * 한 수업 기록 전체의 CP 장부 항목들을 생성한다.
 * attendance_only=1 이면 단어시험 CP는 계산하지 않는다.
 * 반환: [{ amount, reason, source_type, breakdown }]  (source_id는 호출측에서 주입)
 */
export function computeLessonLedgerEntries(rules, lesson) {
  const entries = [];

  const att = computeAttendanceCp(rules, lesson);
  if (att.amount !== 0) {
    entries.push({
      amount: att.amount,
      reason: att.reason,
      breakdown: att.breakdown,
      kind: 'attendance',
    });
  }

  if (!lesson.attendance_only) {
    const word = computeWordCp(rules, lesson);
    if (word.amount !== 0) {
      entries.push({
        amount: word.amount,
        reason: word.reason,
        breakdown: word.breakdown,
        kind: 'word',
      });
    }
  }

  return entries;
}

/**
 * 강사 규칙 + 학생 예외 규칙을 병합해 effective 규칙을 만든다.
 * studentOverride의 값이 null/undefined가 아니면 override.
 */
export function mergeRules(teacherRules, studentOverride) {
  const merged = { ...teacherRules };
  if (studentOverride) {
    for (const key of Object.keys(studentOverride)) {
      const v = studentOverride[key];
      if (v !== null && v !== undefined && key !== 'student_id' && key !== 'updated_at') {
        merged[key] = v;
      }
    }
  }
  return merged;
}

export const DEFAULT_RULES = {
  word_pass_score: 80,
  pass_in_time_cp: 10,
  perfect_bonus_cp: 5,
  pass_late_cp: -5,
  no_show_cp: -10,
  late_grace_min: 5,
  late_penalty_per_min: 1,
  monthly_no_late_bonus: 30,
  monthly_word_bonus: 30,
  participation_stack3_cp: 5,
};
