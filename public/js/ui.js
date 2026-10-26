// DOM / UI 유틸리티.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, type = 'info', ms = 3200) {
  const area = document.getElementById('toast-area');
  const t = h('div', { class: `toast ${type}` }, msg);
  area.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity 0.3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/** 모달 열기. render(close)가 모달 내용 엘리먼트를 반환. */
export function openModal(render, { onClose } = {}) {
  const root = document.getElementById('modal-root');
  const backdrop = h('div', { class: 'modal-backdrop' });
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onEsc);
    if (onClose) onClose();
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  const content = render(close);
  backdrop.appendChild(content);
  root.appendChild(backdrop);
  // 첫 입력 포커스
  const focusable = content.querySelector('input, select, textarea, button');
  if (focusable) setTimeout(() => focusable.focus(), 30);
  return close;
}

export function modalShell({ title, body, footer, close }) {
  return h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' },
      h('h3', { class: 'wrap-anywhere' }, title),
      h('button', { class: 'close-x', 'aria-label': '닫기', onClick: close }, '×')
    ),
    h('div', { class: 'modal-body' }, body),
    footer ? h('div', { class: 'modal-foot' }, footer) : null
  );
}

/** 삭제 등 확인 다이얼로그 (Promise<boolean>) */
export function confirmDialog(message, { title = '확인', confirmText = '확인', danger = true, detail } = {}) {
  return new Promise((resolve) => {
    openModal((close) => modalShell({
      title,
      close: () => { close(); resolve(false); },
      body: h('div', {},
        h('p', { class: 'wrap-anywhere', style: { whiteSpace: 'pre-wrap' } }, message),
        detail ? h('div', { class: 'hint wrap-anywhere', style: { marginTop: '0.5rem', whiteSpace: 'pre-wrap' } }, detail) : null
      ),
      footer: [
        h('button', { class: 'btn secondary', onClick: () => { close(); resolve(false); } }, '취소'),
        h('button', { class: danger ? 'btn danger' : 'btn', onClick: () => { close(); resolve(true); } }, confirmText),
      ],
    }));
  });
}

export function loadingEl(text = '불러오는 중...') {
  return h('div', { class: 'loading-box' }, h('div', { class: 'spinner' }), text);
}

/** 오류 표시 + 다시 시도 버튼 */
export function errorEl(err, onRetry) {
  const msg = err && err.message ? err.message : '알 수 없는 오류가 발생했습니다.';
  return h('div', { class: 'error-box' },
    h('div', { class: 'wrap-anywhere' }, '⚠️ ' + msg),
    onRetry ? h('button', { class: 'btn', onClick: onRetry }, '다시 시도') : null
  );
}

export function fmtCp(n) {
  const v = Number(n) || 0;
  return (v > 0 ? '+' : '') + v;
}
