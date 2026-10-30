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

/**
 * 모의고사 유형별 정답률 가로 막대그래프 (공용).
 * typeAccuracy: [{ type, correct, total, rate(0~100|null) }]
 * - 약한 순(정답률 오름차순) 정렬
 * - 정답률 0% 도 최소 폭(1.5%)으로 보이게 하여 시인성 보장
 * - 색: <50 빨강, <70 주황, 그 외 초록
 * opts.title, opts.hint 로 머리글/설명 지정 가능
 */
export function typeAccuracyBars(typeAccuracy, opts = {}) {
  const list = (typeAccuracy || []).filter((t) => t.rate !== null).slice().sort((a, b) => a.rate - b.rate);
  if (!list.length) return null;
  const bars = list.map((t) => {
    const pct = t.rate;
    const cls = pct < 50 ? 'bar-red' : pct < 70 ? 'bar-orange' : 'bar-green';
    const width = Math.max(1.5, pct); // 0% 도 바닥에 조금 보이게
    return h('div', { class: 'tc-row' },
      h('div', { class: 'tc-label' }, h('span', { class: 'tc-type wrap-anywhere' }, t.type), h('span', { class: 'tc-frac muted' }, `${t.correct}/${t.total}`)),
      h('div', { class: 'tc-track' }, h('div', { class: `tc-fill ${cls}`, style: { width: width + '%' } })),
      h('div', { class: 'tc-pct' }, `${pct}%`),
    );
  });
  return h('div', { class: 'word-chart', style: { marginTop: '0.6rem' } },
    h('div', { class: 'wc-head' },
      h('strong', {}, opts.title || '유형별 강·약점 (정답률)'),
      h('span', { class: 'wc-legend' },
        h('span', { class: 'wc-dot bar-red' }), '약함 ',
        h('span', { class: 'wc-dot bar-orange' }), '보통 ',
        h('span', { class: 'wc-dot bar-green' }), '강함'),
    ),
    h('div', { class: 'hint', style: { margin: '0 0 0.5rem' } }, opts.hint || '위에서부터 정답률이 낮은(먼저 보강할) 유형입니다.'),
    ...bars,
  );
}

/**
 * 2-상태 토글 스위치. 좌/우 라벨과 값을 받아 슬라이드 토글을 만든다.
 * options: [[leftValue, leftLabel], [rightValue, rightLabel]]
 * current: 현재 선택된 value (없으면 왼쪽)
 * onChange(value): 전환 시 호출
 * 반환 엘리먼트는 getter `.value` 로 현재 선택값을 제공한다.
 */
export function toggleSwitch(options, current, onChange) {
  const [[lv, ll], [rv, rl]] = options;
  let value = current === rv ? rv : lv;

  const leftLabel = h('span', { class: 'ts-label' }, ll);
  const rightLabel = h('span', { class: 'ts-label' }, rl);
  const knob = h('span', { class: 'ts-knob' });
  const track = h('div', { class: 'ts-track', role: 'switch', tabindex: '0' }, knob);
  const wrap = h('div', { class: 'toggle-switch' }, leftLabel, track, rightLabel);

  function apply() {
    const isRight = value === rv;
    wrap.classList.toggle('is-right', isRight);
    leftLabel.classList.toggle('on', !isRight);
    rightLabel.classList.toggle('on', isRight);
    track.setAttribute('aria-checked', isRight ? 'true' : 'false');
  }
  function toggle() {
    value = value === lv ? rv : lv;
    apply();
    if (onChange) onChange(value);
  }
  track.addEventListener('click', toggle);
  track.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
  // 라벨 클릭 시 해당 값으로 직접 전환
  leftLabel.addEventListener('click', () => { if (value !== lv) toggle(); });
  rightLabel.addEventListener('click', () => { if (value !== rv) toggle(); });
  apply();

  Object.defineProperty(wrap, 'value', { get: () => value });
  return wrap;
}

/**
 * "표시 개수 선택(5개/10개/전체)" 컨트롤이 달린 뷰 컨테이너.
 * 데이터 개수에 따라 [5개 보기][10개 보기][전체 보기] 버튼을 제공하고,
 * 선택이 바뀌면 render(limit) 로 내용을 다시 그린다. (limit: 숫자 또는 Infinity)
 *
 * @param {object} o
 *   total: 전체 항목 수
 *   render: (limit:number) => HTMLElement  // limit 개수만큼 그린 내용(표/그래프 등)
 *   default: 초기 limit (기본 5)
 *   title: 선택 컨트롤 왼쪽에 표시할 라벨(선택)
 * 반환: 컨트롤 + 내용이 담긴 래퍼
 */
export function countViewer({ total, render, default: def = 5, title = '' }) {
  const options = [];
  if (total > 5) options.push(5);
  if (total > 10) options.push(10);
  // 전체 옵션은 5개 초과일 때만 의미 있음
  const showControl = total > 5;
  let limit = Math.min(def, total);
  if (!showControl) limit = total; // 5개 이하면 컨트롤 없이 전체

  const body = h('div', {});
  const controls = h('div', { class: 'count-viewer-bar' });

  function paintControls() {
    clear(controls);
    if (title) controls.appendChild(h('span', { class: 'cv-title' }, title));
    const chips = h('div', { class: 'cv-chips' });
    const mk = (val, label) => {
      const active = (val === Infinity ? limit >= total : limit === val);
      return h('button', { class: 'cv-chip' + (active ? ' active' : ''), onClick: () => { limit = val === Infinity ? total : val; redraw(); } }, label);
    };
    if (total > 5) chips.appendChild(mk(5, '5개'));
    if (total > 10) chips.appendChild(mk(10, '10개'));
    chips.appendChild(mk(Infinity, '전체'));
    controls.appendChild(chips);
  }
  function redraw() {
    paintControls();
    clear(body);
    body.appendChild(render(limit));
  }
  const wrap = h('div', { class: 'count-viewer' });
  if (showControl) wrap.appendChild(controls);
  wrap.appendChild(body);
  redraw();
  return wrap;
}

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
