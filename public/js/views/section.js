import { h } from '../ui.js';
import { getCollapsed, setCollapsed } from '../state.js';

/**
 * 접고 펼칠 수 있는 섹션 카드.
 * key: 저장 식별자, title, bodyFactory(): Element
 * opts: { badge, subtitle, icon }
 */
export function collapsibleSection(key, title, bodyFactory, { badge, subtitle, icon } = {}) {
  const collapsed = getCollapsed()[key] === true;
  const body = h('div', { class: 'section-body' });
  let built = false;

  const toggleLabel = h('span', { class: 'toggle-label' }, collapsed ? '펼치기' : '접기');

  const card = h('div', { class: 'card' + (collapsed ? ' collapsed' : '') },
    h('div', { class: 'section-head', role: 'button', tabindex: '0',
      onClick: toggle,
      onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } },
    },
      icon ? h('span', { class: 'section-icon' }, icon) : null,
      h('div', { class: 'section-titles' },
        h('h2', { class: 'wrap-anywhere' }, title, badge != null ? h('span', { class: 'section-badge' }, badge) : null),
        subtitle ? h('div', { class: 'section-sub wrap-anywhere' }, subtitle) : null
      ),
      h('span', { class: 'section-toggle' }, toggleLabel, h('span', { class: 'toggle-icon' }, '▾'))
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
    toggleLabel.textContent = isCollapsed ? '펼치기' : '접기';
    setCollapsed(key, isCollapsed);
    if (!isCollapsed) build();
  }

  if (!collapsed) build();

  card.__expand = () => { if (card.classList.contains('collapsed')) toggle(); };
  card.__collapse = () => { if (!card.classList.contains('collapsed')) { card.classList.add('collapsed'); toggleLabel.textContent = '펼치기'; setCollapsed(key, true); } };
  card.__rebuild = () => { built = false; body.innerHTML = ''; if (!card.classList.contains('collapsed')) build(); };
  return card;
}
