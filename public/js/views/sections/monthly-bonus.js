// 월간 보너스 (무지각 · 단어 성실 보너스) 관리.
// 기존 '출결 관리' 탭에서 분리되어 '학습 기록' 탭 하단에 표시된다.
import { h, openModal, modalShell, toast, confirmDialog, fmtCp } from '../../ui.js';
import { api } from '../../api.js';

export function renderMonthlyBonus(ctx) {
  const bonuses = ctx.detail.monthlyBonuses;
  const wrap = h('div', {});

  wrap.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.5rem' } },
    h('button', { class: 'btn sm sage', onClick: () => computeBonus(ctx) }, '완료된 월 보너스 계산'),
  ));

  if (bonuses.length) {
    const brows = bonuses.map((b) =>
      h('tr', {},
        h('td', { 'data-label': '월' }, b.month_key),
        h('td', { 'data-label': '무지각', class: b.no_late_bonus ? 'pos' : 'muted' }, fmtCp(b.no_late_bonus)),
        h('td', { 'data-label': '단어성실', class: b.word_bonus ? 'pos' : 'muted' }, fmtCp(b.word_bonus)),
        h('td', { 'data-label': '수동조정', class: b.manual_adjust ? (b.manual_adjust > 0 ? 'pos' : 'neg') : 'muted' }, fmtCp(b.manual_adjust)),
        h('td', { 'data-label': '합계', style: { fontWeight: 700 } }, fmtCp(b.no_late_bonus + b.word_bonus + b.manual_adjust)),
        h('td', { 'data-label': '' },
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn sm secondary', onClick: () => adjustBonus(ctx, b) }, '수정'),
            h('button', { class: 'btn sm danger', onClick: () => removeBonus(ctx, b) }, '제거'),
          )
        )
      )
    );
    wrap.appendChild(h('div', { class: 'card-table' }, h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, '월'), h('th', {}, '무지각'), h('th', {}, '단어성실'), h('th', {}, '수동조정'), h('th', {}, '합계'), h('th', {}, ''))),
        h('tbody', {}, ...brows)))));
  } else {
    wrap.appendChild(h('div', { class: 'empty' }, '월간 보너스 기록이 없습니다.'));
  }

  return wrap;
}

function computeBonus(ctx) {
  openModal((close) => {
    const month = h('input', { type: 'month', value: prevMonth() });
    const run = async () => {
      try {
        await api.post(`/api/students/${ctx.student.id}/bonuses/${month.value}`, {});
        toast('월간 보너스가 계산되었습니다.', 'success');
        close(); ctx.reload();
      } catch (e) { toast(e.message, 'error'); }
    };
    return modalShell({
      title: '월간 보너스 계산', close,
      body: h('div', {},
        h('div', { class: 'hint', style: { marginBottom: '0.5rem' } }, '완료된 월을 선택하세요. 무지각·단어 성실 조건을 자동 평가합니다.'),
        h('div', { class: 'field' }, h('label', {}, '대상 월'), month)),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn sage', onClick: run }, '계산')],
    });
  });
}

function adjustBonus(ctx, b) {
  openModal((close) => {
    const adj = h('input', { type: 'number', value: b.manual_adjust });
    const run = async () => {
      try {
        await api.put(`/api/students/${ctx.student.id}/bonuses/${b.month_key}`, { manual_adjust: Number(adj.value) || 0 });
        toast('조정되었습니다.', 'success'); close(); ctx.reload();
      } catch (e) { toast(e.message, 'error'); }
    };
    return modalShell({
      title: `${b.month_key} 보너스 수동 조정`, close,
      body: h('div', { class: 'field' }, h('label', {}, '수동 조정액 (자동 보너스에 가감)'), adj),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: run }, '저장')],
    });
  });
}

async function removeBonus(ctx, b) {
  const ok = await confirmDialog(`${b.month_key} 월간 보너스를 제거하시겠습니까?`, { title: '보너스 제거', confirmText: '제거' });
  if (!ok) return;
  try { await api.del(`/api/students/${ctx.student.id}/bonuses/${b.month_key}`); toast('제거되었습니다.', 'success'); ctx.reload(); }
  catch (e) { toast(e.message, 'error'); }
}

function prevMonth() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
