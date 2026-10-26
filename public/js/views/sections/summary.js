import { h, openModal, modalShell, toast, confirmDialog } from '../../ui.js';
import { api } from '../../api.js';
import { openStudentForm } from '../student-form.js';

export function renderSummary(ctx) {
  const s = ctx.student;
  const d = ctx.detail;
  const goalText = (type, val) => {
    if (type === 'undecided' || val == null || val === '') return h('span', { class: 'goal-undecided' }, '미정');
    // 기존에 '2등급' 처럼 단위까지 저장된 데이터 호환: 숫자만 추출 후 단위 1회만 부착
    const num = String(val).replace(/[^0-9.]/g, '');
    const display = num || String(val);
    return h('span', { class: 'goal-set' }, type === 'grade' ? `${display}등급` : `${display}점`);
  };

  // 빠른 통계 계산
  const lessons = d.lessons || [];
  const lessonCount = lessons.filter((l) => !l.attendance_only).length;
  const wordTaken = lessons.filter((l) => l.word_status === 'taken' && l.word_score != null);
  const wordAvg = wordTaken.length ? (wordTaken.reduce((a, l) => a + l.word_score, 0) / wordTaken.length).toFixed(1) : '-';
  const schoolExams = (d.exams || []).filter((e) => e.exam_type === 'school' && e.score != null);
  const examAvg = schoolExams.length ? (schoolExams.reduce((a, e) => a + e.score, 0) / schoolExams.length).toFixed(1) : '-';
  const lastLesson = lessons.map((l) => l.lesson_date).sort().slice(-1)[0];

  const wrap = h('div', { class: 'summary-v2' });

  // ══ HERO: CP 포인트 (크게·직관적) ══
  const total = s.available_cp + s.pending_cp;
  const availPct = total > 0 ? Math.round((s.available_cp / total) * 100) : 0;
  const nextMonthAvail = s.available_cp + s.pending_cp; // 다음 달 1일이면 대기분이 가용으로

  wrap.appendChild(h('div', { class: 'cp-hero' },
    h('div', { class: 'cp-hero-head' },
      h('span', { class: 'cp-hero-title' }, 'CP 포인트'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm ghost', onClick: openLedgerJump }, '지급 내역'),
        h('button', { class: 'btn sm orange', onClick: () => openManualCp(ctx) }, '＋ CP 지급'),
      )
    ),
    // 메인: 현재 사용 가능 CP 대형 표시
    h('div', { class: 'cp-hero-main' },
      h('div', { class: 'cp-hero-big' },
        h('span', { class: 'cp-hero-num' }, String(s.available_cp)),
        h('span', { class: 'cp-hero-unit' }, 'CP'),
      ),
      h('div', { class: 'cp-hero-caption' }, '지금 바로 사용 가능'),
      h('span', { class: 'cp-exchange-badge' + (s.available_cp > 0 ? '' : ' off') },
        s.available_cp > 0 ? '🎁 상품 교환 가능' : '교환 가능 CP 부족'),
    ),
    // 보조 지표 2개
    h('div', { class: 'cp-hero-sub' },
      subMetric('pending', s.pending_cp, '대기 CP', '이번 달 적립분'),
      subMetric('next', nextMonthAvail, '다음 달 사용 가능', '매달 1일 전환'),
    ),
    h('div', { class: 'cp-bar' }, h('div', { class: 'cp-bar-fill', style: { width: availPct + '%' } })),
    h('div', { class: 'cp-bar-labels' },
      h('span', { class: 'muted' }, `사용 가능 ${s.available_cp} · 대기 ${s.pending_cp}`),
      h('span', { class: 'muted' }, '대기 CP는 다음 달 1일부터 사용 가능'),
    )
  ));

  // ══ 하단: 학생 정보(축약) + 빠른 통계 (작게) ══
  const bottom = h('div', { class: 'summary-bottom' });

  // 학생 정보 (축약형)
  bottom.appendChild(h('div', { class: 'mini-panel' },
    h('div', { class: 'mini-panel-head' },
      h('div', { class: 'student-head' },
        h('span', { class: 'student-mini-name wrap-anywhere' }, s.name),
        s.grade ? h('span', { class: 'grade-chip' }, s.grade) : null,
      ),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm secondary', onClick: () => openStudentForm(s, ctxTeacher(), () => ctx.reload()) }, '수정'),
        h('button', { class: 'btn sm secondary', onClick: () => exportStudentJson(s), title: '이 학생의 모든 기록을 JSON 파일로 저장' }, '⬇ 내보내기'),
        h('button', { class: 'btn sm danger', onClick: () => deleteStudent(ctx) }, '삭제'),
      )
    ),
    h('div', { class: 'mini-info-grid' },
      miniInfo('학교', s.school || '-'),
      miniInfo('분반', s.class_name || '-'),
      miniInfo('과목', s.subject || '-'),
      miniInfo('나이', s.age ? `${s.age}세` : '-'),
      miniInfo('담당 강사', ctxTeacher()?.name || '-'),
      miniInfo('최근 수업', lastLesson || '-'),
      h('div', { class: 'mini-info' }, h('span', { class: 'mini-k' }, '모의 목표'), h('span', { class: 'mini-v' }, goalText(s.mock_goal_type, s.mock_goal_value))),
      h('div', { class: 'mini-info' }, h('span', { class: 'mini-k' }, '내신 목표'), h('span', { class: 'mini-v' }, goalText(s.exam_goal_type, s.exam_goal_value))),
    )
  ));

  // 빠른 통계 (작게)
  bottom.appendChild(h('div', { class: 'mini-panel' },
    h('div', { class: 'mini-panel-title' }, '빠른 통계'),
    h('div', { class: 'quick-stats-mini' },
      quickStat(lessonCount, '누적 수업'),
      quickStat(wordAvg, '단어 평균'),
      quickStat(examAvg, '내신 평균'),
      quickStat(s.cumulative_cp, '축적 CP', 'cum'),
    )
  ));

  wrap.appendChild(bottom);
  return wrap;

  function subMetric(cls, v, label, note) {
    return h('div', { class: `cp-submetric ${cls}` },
      h('div', { class: 'cp-submetric-v' }, String(v)),
      h('div', { class: 'cp-submetric-l' }, label),
      h('div', { class: 'cp-submetric-note' }, note));
  }
  function miniInfo(k, v) {
    return h('div', { class: 'mini-info' }, h('span', { class: 'mini-k' }, k), h('span', { class: 'mini-v wrap-anywhere' }, v));
  }

  function quickStat(v, l, cls) {
    return h('div', { class: 'qstat' }, h('div', { class: 'qstat-v ' + (cls || '') }, v), h('div', { class: 'qstat-l' }, l));
  }
  function openLedgerJump() {
    const card = document.querySelector('[data-section="ledger"]');
    if (card && card.__expand) {
      card.__expand();
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      toast('“CP 지급 내역” 섹션에서 전체 내역을 볼 수 있습니다.', 'info');
    }
  }
}

function ctxTeacher() {
  // state에서 teacher 가져오기 (순환참조 피하려 동적 import 대신 전역 접근)
  return window.__cpTeacher || null;
}

function openManualCp(ctx) {
  openModal((close) => {
    const amount = h('input', { type: 'number', placeholder: '예: 20 또는 -10' });
    const reason = h('input', { placeholder: '지급/차감 사유' });
    const immediate = h('input', { type: 'checkbox' });
    const save = async () => {
      try {
        await api.post(`/api/students/${ctx.student.id}/manual-cp`, {
          amount: Number(amount.value), reason: reason.value, immediate: immediate.checked,
        });
        toast('CP가 반영되었습니다.', 'success');
        close();
        ctx.reload();
      } catch (e) { toast(e.message, 'error'); }
    };
    return modalShell({
      title: '수동 CP 지급 / 차감', close,
      body: h('div', {},
        h('div', { class: 'field' }, h('label', {}, 'CP 금액 (음수 = 차감)'), amount),
        h('div', { class: 'field' }, h('label', {}, '사유'), reason),
        h('label', { style: { display: 'flex', gap: '0.4rem', alignItems: 'center' } }, immediate, '즉시 사용 가능 CP로 지급 (체크 해제 시 대기 CP)'),
      ),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')],
    });
  });
}

async function exportStudentJson(s) {
  try {
    const data = await api.get(`/api/students/${s.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `학생_${s.name}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`'${s.name}' 학생 데이터를 JSON으로 저장했습니다.`, 'success');
  } catch (e) { toast('내보내기 실패: ' + e.message, 'error'); }
}

async function deleteStudent(ctx) {
  const impact = await api.get(`/api/students/${ctx.student.id}/deletion-impact`);
  const ok = await confirmDialog(
    `'${ctx.student.name}' 학생을 삭제하시겠습니까?`,
    {
      title: '학생 삭제',
      confirmText: '삭제',
      detail: `연결된 기록이 모두 함께 삭제됩니다:\n· 수업 ${impact.lessons}건\n· 시험 ${impact.exams}건\n· CP 장부 ${impact.ledger}건\n· 구매 ${impact.purchases}건\n· 참여 ${impact.participation}건\n이 작업은 되돌릴 수 없습니다.`,
    }
  );
  if (!ok) return;
  try {
    await api.del(`/api/students/${ctx.student.id}`);
    toast('삭제되었습니다.', 'success');
    location.reload();
  } catch (e) { toast(e.message, 'error'); }
}
