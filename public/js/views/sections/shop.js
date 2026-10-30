import { h, clear, openModal, modalShell, toast, confirmDialog, loadingEl } from '../../ui.js';
import { api } from '../../api.js';
import { state } from '../../state.js';

export function renderShop(ctx) {
  const wrap = h('div', {});

  // 학생이 보낸 구매 희망(승인 대기) — 있으면 맨 위에 표시
  const reqs = (ctx.detail && ctx.detail.purchaseRequests) || [];
  if (reqs.length) wrap.appendChild(renderPurchaseRequests(ctx, reqs));

  const tabbar = h('div', { class: 'tab-bar' });
  const content = h('div', {});
  const tabs = [['store', '🛒 상점'], ['purchases', '🧾 구매내역'], ['inventory', '🎒 인벤토리·사용내역']];
  let current = 'store';

  function paintTabs() {
    clear(tabbar);
    for (const [key, label] of tabs) {
      tabbar.appendChild(h('button', { class: 'tab' + (current === key ? ' active' : ''), onClick: () => { current = key; render(); } }, label));
    }
  }
  function render() {
    paintTabs();
    clear(content);
    if (current === 'store') renderStore(ctx, content);
    else if (current === 'purchases') renderPurchases(ctx, content);
    else renderInventory(ctx, content);
  }
  wrap.appendChild(tabbar);
  wrap.appendChild(content);
  render();
  return wrap;
}

// ---- 상점 ----
async function renderStore(ctx, content) {
  content.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.6rem' } },
    h('button', { class: 'btn sm', onClick: () => openProductForm(ctx, null, () => renderStore(ctx, clear(content))) }, '+ 상품 추가'),
    h('button', { class: 'btn sm secondary', onClick: () => openManageProducts(ctx) }, '상품 관리')));

  const box = h('div', {});
  content.appendChild(box);
  box.appendChild(loadingEl());
  let products;
  try { const res = await api.get(`/api/students/${ctx.student.id}/products`); products = res.products; }
  catch (e) { clear(box); box.appendChild(h('div', { class: 'error-box' }, e.message)); return; }

  clear(box);
  if (!products.length) { box.appendChild(h('div', { class: 'empty' }, '판매 중인 상품이 없습니다.')); return; }

  const grid = h('div', { class: 'product-grid' });
  for (const p of products) {
    grid.appendChild(h('div', { class: 'product-card' },
      p.image_url ? h('img', { src: p.image_url, alt: p.name }) : h('div', { class: 'p-noimg' }, '🎁'),
      h('div', { class: 'p-body' },
        h('div', { class: 'p-name wrap-anywhere' }, p.name),
        p.description ? h('div', { class: 'muted wrap-anywhere', style: { fontSize: '0.82rem' } }, p.description) : null,
        h('div', { class: 'p-cp' }, `${p.effective_cp} CP` + (p.effective_cp !== p.base_cp ? ` (기본 ${p.base_cp})` : '')),
        p.price_krw ? h('div', { class: 'muted' }, `${p.price_krw.toLocaleString()}원`) : null,
        h('button', { class: 'btn sm', style: { marginTop: 'auto' }, onClick: () => buy(ctx, p) }, '구매'))));
  }
  box.appendChild(grid);
}

async function buy(ctx, p) {
  const ok = await confirmDialog(`'${p.name}'을(를) ${p.effective_cp} CP로 구매하시겠습니까?`, { title: '상품 구매', confirmText: '구매', danger: false });
  if (!ok) return;
  try { await api.post(`/api/students/${ctx.student.id}/purchase`, { product_id: p.id }); toast('구매 완료! 인벤토리에 추가되었습니다.', 'success'); ctx.reload(); }
  catch (e) { toast(e.message, 'error'); }
}

// ---- 구매내역 (담당 학생 전체 또는 특정) ----
async function renderPurchases(ctx, content) {
  const onlyMe = h('input', { type: 'checkbox' });
  content.appendChild(h('label', { style: { display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.6rem' } }, onlyMe, `${ctx.student.name} 학생만 보기`));
  const box = h('div', {});
  content.appendChild(box);

  async function load() {
    clear(box); box.appendChild(loadingEl());
    try {
      const q = onlyMe.checked ? { student_id: ctx.student.id } : {};
      const { purchases } = await api.get(`/api/teachers/${state.teacher.id}/purchases`, { query: q });
      clear(box);
      if (!purchases.length) { box.appendChild(h('div', { class: 'empty' }, '구매 내역이 없습니다.')); return; }
      box.appendChild(h('div', { class: 'card-table' }, h('div', { class: 'table-scroll' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, '구매일'), h('th', {}, '학생'), h('th', {}, '상품'), h('th', {}, 'CP'), h('th', {}, '상태'))),
          h('tbody', {}, ...purchases.map((p) => h('tr', {},
            h('td', { 'data-label': '구매일' }, p.purchased_at.slice(0, 10)), h('td', { 'data-label': '학생' }, p.student_name), h('td', { 'data-label': '상품', class: 'wrap-anywhere' }, p.product_name),
            h('td', { 'data-label': 'CP', class: 'neg' }, `-${p.cp_spent}`),
            h('td', { 'data-label': '상태' }, h('span', { class: 'pill ' + (p.inventory_state === 'used' ? 'none' : 'present') }, p.inventory_state === 'used' ? '사용완료' : '보유중')))))))));
    } catch (e) { clear(box); box.appendChild(h('div', { class: 'error-box' }, e.message)); }
  }
  onlyMe.onchange = load;
  load();
}

// ---- 인벤토리 ----
async function renderInventory(ctx, content) {
  const box = h('div', {});
  content.appendChild(box);
  box.appendChild(loadingEl());
  let inv;
  try { const res = await api.get(`/api/students/${ctx.student.id}/inventory`); inv = res.inventory; }
  catch (e) { clear(box); box.appendChild(h('div', { class: 'error-box' }, e.message)); return; }
  clear(box);
  if (!inv.length) { box.appendChild(h('div', { class: 'empty' }, '보유 중인 상품이 없습니다.')); return; }

  const invRows = inv.map((p) => {
    const stateBtn = p.inventory_state === 'used'
      ? h('button', { class: 'btn sm secondary', onClick: () => setState(ctx, p, 'owned') }, '보유로 되돌리기')
      : h('button', { class: 'btn sm sage', onClick: () => setState(ctx, p, 'used') }, '사용 처리');
    return h('tr', {},
      h('td', { 'data-label': '상품', class: 'wrap-anywhere' }, p.product_name),
      h('td', { 'data-label': '구매일' }, p.purchased_at.slice(0, 10)),
      h('td', { 'data-label': '상태' }, h('span', { class: 'pill ' + (p.inventory_state === 'used' ? 'none' : 'present') }, p.inventory_state === 'used' ? '사용완료' : '보유중')),
      h('td', { 'data-label': '사용일' }, p.used_at || '-'),
      h('td', { 'data-label': '' }, stateBtn));
  });
  box.appendChild(h('div', { class: 'card-table' }, h('div', { class: 'table-scroll' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, h('th', {}, '상품'), h('th', {}, '구매일'), h('th', {}, '상태'), h('th', {}, '사용일'), h('th', {}, ''))),
      h('tbody', {}, ...invRows)))));
}

async function setState(ctx, p, st) {
  try { await api.put(`/api/purchases/${p.id}/state`, { state: st }); toast('처리되었습니다.', 'success'); ctx.reload(); }
  catch (e) { toast(e.message, 'error'); }
}

// ---- 학생 구매 희망(승인 대기) ----
function renderPurchaseRequests(ctx, reqs) {
  const rows = reqs.map((r) => h('tr', {},
    h('td', { 'data-label': '상품', class: 'wrap-anywhere' }, r.product_name),
    h('td', { 'data-label': '희망일' }, (r.purchased_at || '').slice(0, 10)),
    h('td', { 'data-label': '필요 CP' }, `${r.cp_spent} CP`),
    h('td', { 'data-label': '' }, h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm sage', onClick: () => approveRequest(ctx, r) }, '승인'),
      h('button', { class: 'btn sm danger', onClick: () => rejectRequest(ctx, r) }, '거절'),
    )),
  ));
  return h('div', { class: 'pending-exams', style: { marginBottom: '0.9rem' } },
    h('div', { class: 'pending-head' },
      h('strong', {}, `🛒 학생이 구매를 희망한 상품 ${reqs.length}건`),
      h('span', { class: 'muted', style: { fontSize: '0.8rem' } }, '승인하면 CP가 차감되고 교환됩니다.'),
    ),
    h('div', { class: 'card-table' }, h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, '상품'), h('th', {}, '희망일'), h('th', {}, '필요 CP'), h('th', {}, ''))),
        h('tbody', {}, ...rows)))),
  );
}

async function approveRequest(ctx, r) {
  const ok = await confirmDialog(`'${r.product_name}' 구매 희망을 승인하시겠습니까?`,
    { title: '구매 희망 승인', confirmText: '승인', detail: `${r.cp_spent} CP가 차감되고 학생 인벤토리에 추가됩니다.` });
  if (!ok) return;
  try { await api.post(`/api/purchases/${r.id}/approve`, {}); toast('승인되었습니다. CP가 차감되었습니다.', 'success'); ctx.reload(); }
  catch (e) { toast(e.message, 'error'); }
}

async function rejectRequest(ctx, r) {
  const ok = await confirmDialog(`'${r.product_name}' 구매 희망을 거절하시겠습니까?`,
    { title: '구매 희망 거절', confirmText: '거절', detail: '학생의 구매 희망이 삭제됩니다. (CP 변동 없음)' });
  if (!ok) return;
  try { await api.post(`/api/purchases/${r.id}/reject`, {}); toast('거절되었습니다.', 'success'); ctx.reload(); }
  catch (e) { toast(e.message, 'error'); }
}

// ---- 상품 폼 (이미지 업로드 포함) ----
export function openProductForm(ctx, product, onSaved) {
  openModal((close) => {
    const field = (label, el) => h('div', { class: 'field' }, h('label', {}, label), el);
    const name = h('input', { value: product?.name || '' });
    const desc = h('textarea', {}, product?.description || '');
    const baseCp = h('input', { type: 'number', min: '0', value: product?.base_cp ?? 0 });
    const price = h('input', { type: 'number', min: '0', value: product?.price_krw ?? '' });
    const status = selEl(['active|판매중', 'ended|종료'], product?.status || 'active');
    let imageUrl = product?.image_url || null;
    const preview = h('img', { src: imageUrl || '', style: { maxWidth: '120px', borderRadius: '8px', display: imageUrl ? '' : 'none' } });
    const file = h('input', { type: 'file', accept: 'image/*' });
    file.onchange = async () => {
      const fl = file.files[0]; if (!fl) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try { const { url } = await api.post('/api/upload', { dataUrl: reader.result }); imageUrl = url; preview.src = url; preview.style.display = ''; toast('이미지 업로드 완료', 'success'); }
        catch (e) { toast('업로드 실패: ' + e.message, 'error'); }
      };
      reader.readAsDataURL(fl);
    };

    const save = async () => {
      const body = { name: name.value, description: desc.value, base_cp: Number(baseCp.value) || 0, price_krw: price.value ? Number(price.value) : null, image_url: imageUrl, status: status.value };
      try {
        if (product) await api.put(`/api/products/${product.id}`, body);
        else await api.post(`/api/teachers/${state.teacher.id}/products`, body);
        toast('저장되었습니다.', 'success'); close(); onSaved && onSaved();
      } catch (e) { toast(e.message, 'error'); }
    };
    return modalShell({
      title: product ? '상품 수정' : '상품 추가', close,
      body: h('div', {},
        field('상품명 *', name), field('설명', desc),
        h('div', { class: 'form-grid' }, field('기본 필요 CP', baseCp), field('원화 가격', price), field('판매 상태', status)),
        field('상품 이미지', h('div', {}, file, preview))),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')],
    });
  });
}

// ---- 상품 관리 (수정/종료/학생별 가격) ----
async function openManageProducts(ctx) {
  openModal((close) => {
    const shell = modalShell({ title: '상품 관리', close, body: h('div', { class: 'loading-box' }, '불러오는 중...'), footer: [h('button', { class: 'btn secondary', onClick: close }, '닫기')] });
    (async () => {
      const body = shell.querySelector('.modal-body');
      try {
        const { products } = await api.get(`/api/teachers/${state.teacher.id}/products`);
        const spRes = await api.get(`/api/students/${ctx.student.id}/products`);
        const priceMap = {};
        spRes.products.forEach((p) => priceMap[p.id] = p.effective_cp);
        body.innerHTML = '';
        body.appendChild(h('div', { class: 'hint', style: { marginBottom: '0.6rem' } }, `“${ctx.student.name}” 학생 전용 가격을 설정할 수 있습니다. 비우면 기본 가격 적용.`));
        if (!products.length) { body.appendChild(h('div', { class: 'empty' }, '상품이 없습니다.')); return; }
        for (const p of products) {
          const priceInp = h('input', { type: 'number', min: '0', style: { width: '90px' }, placeholder: `기본 ${p.base_cp}`, value: (priceMap[p.id] !== undefined && priceMap[p.id] !== p.base_cp) ? priceMap[p.id] : '' });
          const rowEl = h('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #e5d8c4', flexWrap: 'wrap' } },
            h('strong', { class: 'wrap-anywhere', style: { flex: '1', minWidth: '120px' } }, p.name + (p.status === 'ended' ? ' (종료)' : '')),
            priceInp,
            h('button', { class: 'btn sm secondary', onClick: async () => {
              try { await api.put(`/api/students/${ctx.student.id}/products/${p.id}/price`, { cp_price: priceInp.value === '' ? null : Number(priceInp.value) }); toast('가격 저장됨', 'success'); } catch (e) { toast(e.message, 'error'); }
            } }, '가격 적용'),
            h('button', { class: 'btn sm', onClick: () => { close(); openProductForm(ctx, p, () => ctx.reload()); } }, '수정'),
            p.status === 'active' ? h('button', { class: 'btn sm danger', onClick: async () => {
              try { await api.post(`/api/products/${p.id}/end`, {}); toast('종료 처리됨', 'success'); p.status = 'ended'; rowEl.querySelector('strong').textContent = p.name + ' (종료)'; } catch (e) { toast(e.message, 'error'); }
            } }, '종료') : null);
          body.appendChild(rowEl);
        }
      } catch (e) { body.innerHTML = ''; body.appendChild(h('div', { class: 'error-box' }, e.message)); }
    })();
    return shell;
  });
}

function selEl(options, current) {
  const s = h('select');
  for (const opt of options) { const [v, l] = opt.split('|'); const o = h('option', { value: v }, l); if (v === current) o.selected = true; s.appendChild(o); }
  return s;
}
