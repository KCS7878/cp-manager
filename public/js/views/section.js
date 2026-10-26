import { h } from '../ui.js';
import { getCollapsed, setCollapsed } from '../state.js';

/**
 * 접고 펼칠 수 있는 섹션 카드.
 * key: 저장 식별자, title, badge, bodyFactory(): Element
 */
export function collapsibleSection(key, title, bodyFactory, { badge } = {}) {
  const collapsed = getCollapsed()[key] === true;
  const body = h('div', { class: 'section-body' });
  let built = false;

  const card = h('div', { class: 'card' + (collapsed ? ' collapsed' : '') },
    h('div', { class: 'section-head', role: 'button', tabindex: '0',
      onClick: toggle,
      onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } },
    },
      h('span', { class: 'toggle-icon' }, '▾'),
      h('h2', { class: 'wrap-anywhere' }, title),
      badge ? h('span', { class: 'section-badge' }, badge) : null
    ),
    body
  );

  function build() {
    if (built) return;
    body.appendChild(bodyFactory());
    built = true;
  }
  function toggle() {
    const isCollapsed = card.classList.toggle('collapsed');
    setCollapsed(key, isCollapsed);
    if (!isCollapsed) build();
  }

  if (!collapsed) build();

  card.__expand = () => { if (card.classList.contains('collapsed')) toggle(); };
  card.__collapse = () => { if (!card.classList.contains('collapsed')) { card.classList.add('collapsed'); setCollapsed(key, true); } };
  card.__rebuild = () => { built = false; body.innerHTML = ''; if (!card.classList.contains('collapsed')) build(); };
  return card;
}
