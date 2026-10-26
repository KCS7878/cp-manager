import { h, openModal, modalShell, toast, confirmDialog } from '../../ui.js';
import { api } from '../../api.js';
import { openStudentForm } from '../student-form.js';

export function renderSummary(ctx) {
  const s = ctx.student;
  const d = ctx.detail;
  const goalText = (type, val) => {
    if (type === 'undecided' || !val) return h('span', { class: 'goal-undecided' }, '미정');
    return h('span', { class: 'goal-set' }, type === 'grade' ? `${val}등급` : `${val}점`);
  };

  // 빠른 통계 계산
  const lessons = d.lessons || [];
  const lessonCount = lessons.filter((l) => !l.attendance_only).length;
  const wordTaken = lessons.filter((l) => l.word_status === 'taken' && l.word_score != null);
  const wordAvg = wordTaken.length ? (wordTaken.reduce((a, l) => a + l.word_score, 0) / wordTaken.length).toFixed(1) : '-';
  const schoolExams = (d.exams || []).filter((e) => e.exam_type === 'school' && e.score != null);
  const examAvg = schoolExams.length ? (schoolExams.reduce((a, e) => a + e.score, 0) / schoolExams.length).toFixed(1) : '-';
  const lastLesson = lessons.map((l) => l.lesson_date).sort().slice(-1)[0];

  const wrap = h('div', { class: 'summary-panels' });

  // ── 패널 1: 학생 정보 ──
  wrap.appendChild(panel('학생 정보 · ' + (ctxTeacher()?.name || ''),
    h('div', {},
      h('div', { class: 'student-head' },
        h('span', { class: 'student-big-name wrap-anywhere' }, s.name),
        s.grade ? h('span', { class: 'grade-chip' }, s.grade) : null,
      ),
      infoRow('학교', s.school || '-'),
      infoRow('과목', s.subject || '-'),
      infoRow('담당 강사', ctxTeacher()?.name || '-'),
      infoRow('분반', s.class_name || '-'),
      infoRow('나이', s.age ? `${s.age}세` : '-'),
      infoRow('최근 수업', lastLesson || '-'),
      h('div', { class: 'info-row' }, h('span', { class: 'info-k' }, '모의 목표'), h('span', { class: 'info-v' }, goalText(s.mock_goal_type, s.mock_goal_value))),
      h('div', { class: 'info-row' }, h('span', { class: 'info-k' }, '내신 목표'), h('span', { class: 'info-v' }, goalText(s.exam_goal_type, s.exam_goal_value))),
      h('div', { class: 'panel-actions' },
        h('button', { class: 'btn sm secondary', onClick: () => openStudentForm(s, ctxTeacher(), () => ctx.reload()) }, '수정'),
        h('button', { class: 'btn sm danger', onClick: () => deleteStudent(ctx) }, '학생 삭제'),
      )
    )
  ));

  // ── 패널 2: CP 포인트 ──
  const total = s.available_cp + s.pending_cp;
  const availPct = total > 0 ? Math.round((s.available_cp / total) * 100) : 0;
  wrap.appendChild(panel('CP 포인트',
    h('div', {},
      h('div', { class: 'cp-panel-head' },
        h('span', { class: 'muted' }, '월별 사용 가능 현황'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn sm ghost', onClick: () => openLedgerJump() }, '지급 내역'),
          h('button', { class: 'btn sm orange', onClick: () => openManualCp(ctx) }, 'CP 지급'),
        )
      ),
      h('div', { class: 'cp-three' },
        cpBox('avail', s.available_cp, '현재 사용 가능'),
        cpBox('pending', s.pending_cp, '대기 CP'),
        cpBox('total', s.available_cp + s.cumulative_cp >= 0 ? (s.available_cp + s.pending_cp) : 0, '다음 달 사용 가능', true),
      ),
      h('div', { class: 'cp-bar' }, h('div', { class: 'cp-bar-fill', style: { width: availPct + '%' } })),
      h('div', { class: 'cp-bar-labels' },
        h('span', { class: 'muted' }, '이번 달 적립 CP는 다음 달 1일부터 사용 가능'),
        h('span', { class: 'cp-exchange' }, s.available_cp > 0 ? '상품 교환 가능' : '교환 가능 CP 부족'),
      )
    )
  ));

  // ── 패널 3: 빠른 통계 ──
  wrap.appendChild(panel('빠른 통계',
    h('div', { class: 'quick-stats' },
      quickStat(lessonCount, '누적 수업'),
      quickStat(wordAvg, '단어 평균'),
      quickStat(examAvg, '내신 평균'),
      quickStat(s.cumulative_cp, '축적 CP', 'cum'),
    )
  ));

  return wrap;

  function panel(title, bodyEl) {
    return h('div', { class: 'sum-panel' }, h('div', { class: 'sum-panel-title' }, title), bodyEl);
  }
  function infoRow(k, v) {
    return h('div', { class: 'info-row' }, h('span', { class: 'info-k' }, k), h('span', { class: 'info-v wrap-anywhere' }, v));
  }
  function cpBox(cls, v, l, highlight) {
    return h('div', { class: `cp-box ${cls}` + (highlight ? ' hl' : '') }, h('div', { class: 'cp-box-v' }, v), h('div', { class: 'cp-box-l' }, l));
  }
  function quickStat(v, l, cls) {
    return h('div', { class: 'qstat' }, h('div', { class: 'qstat-v ' + (cls || '') }, v), h('div', { class: 'qstat-l' }, l));
  }
  function openLedgerJump() {
    const card = document.querySelector('.card.collapsed');
    // 지급 내역 섹션 펼치기 시도
    toast('“CP 지급 내역” 섹션에서 전체 내역을 볼 수 있습니다.', 'info');
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
