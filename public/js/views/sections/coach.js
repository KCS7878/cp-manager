import { h, clear, loadingEl, errorEl } from '../../ui.js';
import { api } from '../../api.js';

export function renderCoach(ctx) {
  const wrap = h('div', {});
  const content = h('div', {});
  wrap.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.6rem' } },
    h('button', { class: 'btn sm secondary', onClick: load }, '🔄 분석 새로고침')));
  wrap.appendChild(content);
  load();
  return wrap;

  async function load() {
    clear(content);
    content.appendChild(loadingEl('분석 중...'));
    let data;
    try {
      data = await api.get(`/api/students/${ctx.student.id}/coach`);
    } catch (e) {
      clear(content);
      content.appendChild(errorEl(new Error('분석을 불러오지 못했습니다: ' + e.message), load));
      return;
    }
    clear(content);
    content.appendChild(render(data));
  }
}

// 숫자/점수를 굵게 강조
function emphasizeNumbers(text) {
  const span = h('span', { class: 'wrap-anywhere' });
  const parts = String(text).split(/(\d+(?:\.\d+)?(?:점|회|%|등급|분|위)?)/g);
  for (const p of parts) {
    if (/^\d+(?:\.\d+)?(?:점|회|%|등급|분|위)?$/.test(p)) span.appendChild(h('b', { class: 'hl-num' }, p));
    else span.appendChild(document.createTextNode(p));
  }
  return span;
}

function render(data) {
  const box = h('div', {});

  if (data.insufficient) {
    box.appendChild(h('div', { class: 'insufficient wrap-anywhere' },
      h('strong', {}, '분석 근거 부족'),
      h('p', { style: { margin: '0.4rem 0 0' } }, '분석에 필요한 기록이 부족합니다. 다음 데이터를 먼저 입력해 주세요:'),
      h('ul', {}, ...(data.needData || []).map((d) => h('li', {}, d)))
    ));
    return box;
  }

  box.appendChild(h('div', { class: 'muted', style: { marginBottom: '0.5rem' } }, `※ ${data.generatedWith}`));

  const grid = h('div', { class: 'coach-grid' });
  grid.appendChild(card('facts', '✅ 기록에서 확인되는 사실', data.facts, (item) =>
    h('li', {}, emphasizeNumbers(item.text), item.cite ? h('span', { class: 'cite' }, ` — "${item.cite}"`) : null)));
  grid.appendChild(card('problems', '⚠️ 현재 문제 상황', data.problems, (item) =>
    h('li', { class: 'coach-problems-text' }, emphasizeNumbers(item.text))));
  grid.appendChild(card('plan', '🧩 해결 설계', data.plan, (item) =>
    h('li', { class: 'coach-plan-text' }, emphasizeNumbers(item.text))));
  grid.appendChild(card('actions', '🎯 다음 수업 추천 행동', data.actions, (item) =>
    h('li', { class: 'coach-actions-text' }, emphasizeNumbers(item.text))));
  box.appendChild(grid);

  // 단어시험 추세
  if (data.wordTrend && data.wordTrend.count > 0) {
    const t = data.wordTrend;
    box.appendChild(h('div', { style: { marginTop: '0.75rem' } },
      h('h4', {}, '📚 단어시험 추세'),
      h('p', { class: 'wrap-anywhere' }, emphasizeNumbers(`총 ${t.count}회 · 평균 ${t.avgScore}점`)),
      h('div', { class: 'table-scroll' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, '날짜'), h('th', {}, '범위'), h('th', {}, '점수'), h('th', {}, '기한'))),
          h('tbody', {}, ...t.recent.map((r) =>
            h('tr', {}, h('td', {}, r.date), h('td', { class: 'wrap-anywhere' }, r.range || '-'),
              h('td', {}, `${r.score}점`), h('td', {}, r.deadlineMet ? '내' : h('span', { class: 'neg' }, '초과')))))))));
  }

  // 유형별 분석
  const ea = data.examAnalysis;
  if (ea && ea.typeAccuracy && ea.typeAccuracy.length) {
    box.appendChild(h('div', { style: { marginTop: '0.75rem' } },
      h('h4', {}, '📊 모의고사 유형별 정답률'),
      h('div', { class: 'table-scroll' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, '유형'), h('th', {}, '정답/전체'), h('th', {}, '정답률'))),
          h('tbody', {}, ...ea.typeAccuracy.map((t) =>
            h('tr', {}, h('td', {}, t.type), h('td', {}, `${t.correct}/${t.total}`),
              h('td', { class: t.rate !== null && t.rate < 60 ? 'neg' : 'pos' }, t.rate !== null ? `${t.rate}%` : '-'))))))));
  }

  return box;

  function card(cls, title, items, renderItem) {
    return h('div', { class: `coach-card ${cls}` },
      h('h4', {}, title),
      items && items.length
        ? h('ul', {}, ...items.map(renderItem))
        : h('p', { class: 'muted' }, '-'));
  }
}
