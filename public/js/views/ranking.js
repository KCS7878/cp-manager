import { h, clear, openModal, modalShell, toast, loadingEl } from '../ui.js';
import { api } from '../api.js';
import { captureToPng } from '../png.js';
import { state } from '../state.js';

export function openRanking(teacher) {
  openModal((close) => {
    const basisSel = selEl(['cumulative|누적 CP', 'monthly|이번 달 획득 CP'], 'cumulative');
    const levelSel = selEl(['|전체', 'middle|중학생', 'high|고등학생'], '');
    const schoolSel = selEl(['|학교 전체', ...(state.schools || []).map((s) => `${s.name}|${s.name}`)], '');
    const classSel = selEl(['|분반 전체', ...(state.classes || []).map((c) => `${c}|${c}`)], '');
    const gradeInp = h('input', { placeholder: '학년(예: 고2)', style: { width: '110px' } });

    const body = h('div', {});
    const list = h('div', { id: 'rankCapture', style: { background: '#f8f2e7', padding: '0.5rem', borderRadius: '10px' } });

    async function load() {
      clear(list); list.appendChild(loadingEl());
      try {
        const data = await api.get(`/api/teachers/${teacher.id}/ranking`, {
          query: { basis: basisSel.value, level: levelSel.value, school: schoolSel.value, class_name: classSel.value, grade: gradeInp.value },
        });
        paint(data);
      } catch (e) { clear(list); list.appendChild(h('div', { class: 'error-box' }, e.message)); }
    }

    function paint(data) {
      clear(list);
      list.appendChild(h('div', { style: { padding: '0.5rem 0.5rem 0.25rem', fontWeight: 800, fontSize: '1.05rem' } },
        `🏆 ${teacher.name} 선생님 TOP ${Math.min(10, data.rows.length)} · ${data.basis === 'monthly' ? '이번 달 (' + data.monthKey + ')' : '누적 CP'}`));
      if (!data.rows.length) { list.appendChild(h('div', { class: 'empty' }, '랭킹 데이터가 없습니다.')); return; }
      const top = data.rows.slice(0, 10);
      for (const r of top) {
        const rankCls = r.rank === 1 ? 'top1' : r.rank === 2 ? 'top2' : r.rank === 3 ? 'top3' : '';
        const symbols = h('span', {});
        const s = r.symbols;
        if (s.quarterTitle) symbols.appendChild(h('span', { class: 'badge-symbol title' }, s.quarterTitle));
        if (s.perfectAttendance) symbols.appendChild(h('span', { class: 'badge-symbol' }, '개근'));
        if (data.toggles.dayStreak && s.dayStreak != null && s.dayStreak > 0) symbols.appendChild(h('span', { class: 'badge-symbol streak' }, `STREAK ${s.dayStreak}`));
        if (s.perfectCount > 0) symbols.appendChild(h('span', { class: 'badge-symbol perfect' }, `PERFECT ${s.perfectCount}`));
        list.appendChild(h('div', { class: 'rank-row' },
          h('span', { class: 'rank-num ' + rankCls }, r.rank),
          h('span', { class: 'rank-name wrap-anywhere' }, r.name + (r.grade ? ` · ${r.grade}` : '') + (r.class_name ? ` · ${r.class_name}` : '')),
          symbols,
          h('span', { class: 'rank-cp' }, `${r.cp} CP`)));
      }
    }

    [basisSel, levelSel, schoolSel, classSel].forEach((el) => el.onchange = load);
    let t; gradeInp.oninput = () => { clearTimeout(t); t = setTimeout(load, 300); };

    body.appendChild(h('div', { class: 'filters', style: { marginBottom: '0.6rem' } }, basisSel, levelSel, schoolSel, classSel, gradeInp));
    body.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.6rem' } },
      h('button', { class: 'btn sm orange', onClick: capturePng }, '🖼 TOP 10 이미지 저장'),
      h('button', { class: 'btn sm secondary', onClick: () => confirmQuarter(teacher, load) }, '분기 칭호 확정')));
    body.appendChild(list);

    async function capturePng() {
      try { await captureToPng(list, `CP매니저_랭킹_${teacher.name}.png`, { background: '#f8f2e7' }); toast('이미지를 저장했습니다.', 'success'); }
      catch (e) { toast('이미지 저장 실패: ' + e.message, 'error'); }
    }

    load();
    return modalShell({ title: '🏆 랭킹', close, body, footer: [h('button', { class: 'btn secondary', onClick: close }, '닫기')] });
  });
}

async function confirmQuarter(teacher, reload) {
  try {
    const res = await api.post(`/api/teachers/${teacher.id}/quarter-titles/confirm`, {});
    if (res.skipped) toast('이미 이번 분기 칭호가 확정되어 있습니다.', 'info');
    else if (res.confirmed && res.confirmed.length) toast(`분기 칭호 확정: ${res.confirmed.map((c) => `${c.title}(${c.student})`).join(', ')}`, 'success');
    else toast('직전 분기 CP 기록이 없어 칭호를 확정할 대상이 없습니다.', 'info');
    reload();
  } catch (e) { toast(e.message, 'error'); }
}

function selEl(options, current) {
  const s = h('select');
  for (const opt of options) { const [v, l] = opt.split('|'); const o = h('option', { value: v }, l); if (v === current) o.selected = true; s.appendChild(o); }
  return s;
}
