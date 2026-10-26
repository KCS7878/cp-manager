import { h, toast, confirmDialog, fmtCp } from '../../ui.js';
import { api } from '../../api.js';

const SOURCE_LABEL = {
  lesson: '수업', participation: '참여', monthly_bonus: '월간보너스',
  manual: '수동', purchase: '구매', exam: '시험',
};

export function renderLedger(ctx) {
  const ledger = ctx.detail.ledger;
  if (!ledger.length) return h('div', { class: 'empty' }, 'CP 지급 내역이 없습니다.');

  const rows = ledger.map((l) =>
    h('tr', {},
      h('td', {}, l.occurred_date),
      h('td', { class: l.amount >= 0 ? 'pos' : 'neg' }, fmtCp(l.amount)),
      h('td', { class: 'wrap-anywhere' }, l.reason),
      h('td', {}, h('span', { class: 'pill ' + (l.status === 'available' ? 'present' : 'late') }, l.status === 'available' ? '가용' : '대기')),
      h('td', { class: 'muted' }, SOURCE_LABEL[l.source_type] || l.source_type),
      h('td', { class: 'muted' }, l.available_date),
      h('td', {},
        l.source_type === 'manual'
          ? h('button', { class: 'btn sm danger', onClick: () => delManual(ctx, l) }, '삭제')
          : h('span', { class: 'muted', title: '원본 기록에서 수정하세요' }, '—')
      )
    )
  );

  return h('div', { class: 'table-scroll' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, '발생일'), h('th', {}, '금액'), h('th', {}, '사유'),
        h('th', {}, '상태'), h('th', {}, '종류'), h('th', {}, '사용가능일'), h('th', {}, ''))),
      h('tbody', {}, ...rows)
    )
  );
}

async function delManual(ctx, l) {
  const ok = await confirmDialog(`수동 CP 항목(${fmtCp(l.amount)})을 삭제하시겠습니까?`, { title: 'CP 항목 삭제', confirmText: '삭제' });
  if (!ok) return;
  try {
    await api.del(`/api/ledger/${l.id}`);
    toast('삭제되었습니다.', 'success');
    ctx.reload();
  } catch (e) { toast(e.message, 'error'); }
}
