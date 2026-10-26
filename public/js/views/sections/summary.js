import { h, openModal, modalShell, toast, confirmDialog } from '../../ui.js';
import { api } from '../../api.js';
import { openStudentForm } from '../student-form.js';

export function renderSummary(ctx) {
  const s = ctx.student;
  const goalText = (type, val) => {
    if (type === 'undecided' || !val) return '미정';
    return type === 'grade' ? `${val} (등급)` : `${val}점`;
  };

  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'summary-grid', style: { marginBottom: '0.75rem' } },
    stat('avail', s.available_cp, '사용 가능 CP'),
    stat('pending', s.pending_cp, '대기 CP'),
    stat('cum', s.cumulative_cp, '누적 CP'),
  ));

  wrap.appendChild(h('div', { class: 'table-scroll' },
    h('table', { class: 'data' },
      h('tbody', {},
        row('과목', s.subject),
        row('나이', s.age ? `${s.age}세` : '-'),
        row('단어 입력 방식', s.word_input_mode === 'count' ? '개수제' : '점수제'),
        row('모의고사 목표', goalText(s.mock_goal_type, s.mock_goal_value)),
        row('내신 목표', goalText(s.exam_goal_type, s.exam_goal_value)),
      )
    )
  ));

  wrap.appendChild(h('div', { class: 'btn-row', style: { marginTop: '0.75rem' } },
    h('button', { class: 'btn sm secondary', onClick: () => openStudentForm(s, ctxTeacher(), () => ctx.reload()) }, '✏ 학생 정보 수정'),
    h('button', { class: 'btn sm orange', onClick: () => openManualCp(ctx) }, '＋ 수동 CP 지급'),
    h('button', { class: 'btn sm danger', onClick: () => deleteStudent(ctx) }, '🗑 학생 삭제'),
  ));

  return wrap;

  function stat(cls, v, l) {
    return h('div', { class: `stat-box ${cls}` }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
  }
  function row(k, v) {
    return h('tr', {}, h('th', { style: { width: '40%' } }, k), h('td', { class: 'wrap-anywhere' }, v ?? '-'));
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
