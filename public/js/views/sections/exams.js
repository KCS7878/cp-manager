import { h, openModal, modalShell, toast, confirmDialog } from '../../ui.js';
import { api } from '../../api.js';

export function renderExams(ctx) {
  const exams = ctx.detail.exams;
  const analysis = ctx.detail.examAnalysis;
  const wrap = h('div', {});

  wrap.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.6rem' } },
    h('button', { class: 'btn sm', onClick: () => openExamForm(ctx, null) }, '+ 시험 기록 추가')));

  // 추세 + 목표
  if (analysis) {
    const goals = analysis.goals;
    wrap.appendChild(h('div', { class: 'summary-grid', style: { marginBottom: '0.75rem' } },
      miniTrend('모의고사', analysis.mockTrend, goals.mock),
      miniTrend('내신', analysis.schoolTrend, goals.school),
    ));
    if (analysis.weakTypes && analysis.weakTypes.length) {
      wrap.appendChild(h('div', { class: 'hint', style: { marginBottom: '0.6rem' } },
        '반복 취약 유형: ' + analysis.weakTypes.map((t) => `${t.type}(${t.rate}%)`).join(', ')));
    }
  }

  if (!exams.length) {
    wrap.appendChild(h('div', { class: 'empty' }, '시험 기록이 없습니다.'));
    return wrap;
  }

  const rows = exams.map((e) =>
    h('tr', {},
      h('td', {}, e.exam_type === 'mock' ? '모의고사' : '내신'),
      h('td', { class: 'wrap-anywhere' }, e.exam_name),
      h('td', {}, e.exam_date),
      h('td', {}, e.score != null ? `${e.score}점` : '-'),
      h('td', {}, e.grade || '-'),
      h('td', { class: 'wrap-anywhere' }, e.weakness || '-'),
      h('td', {}, h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm secondary', onClick: () => openExamForm(ctx, e) }, '수정'),
        h('button', { class: 'btn sm danger', onClick: () => delExam(ctx, e) }, '삭제'))))
  );
  wrap.appendChild(h('div', { class: 'table-scroll' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, h('th', {}, '종류'), h('th', {}, '시험명'), h('th', {}, '시험일'), h('th', {}, '점수'), h('th', {}, '등급'), h('th', {}, '약점'), h('th', {}, ''))),
      h('tbody', {}, ...rows))));
  return wrap;

  function miniTrend(label, trend, goal) {
    const last = trend[trend.length - 1];
    const goalTxt = goal.type === 'undecided' || !goal.value ? '목표 미정' : `목표 ${goal.value}${goal.type === 'score' ? '점' : ''}`;
    return h('div', { class: 'stat-box' },
      h('div', { class: 'l' }, label),
      h('div', { class: 'v', style: { fontSize: '1.2rem' } }, last && last.score != null ? `${last.score}점` : '-'),
      h('div', { class: 'l' }, goalTxt),
      h('div', { class: 'l muted' }, `${trend.length}회 기록`));
  }
}

export function openExamForm(ctx, exam) {
  openModal((close) => {
    const field = (label, el) => h('div', { class: 'field' }, h('label', {}, label), el);
    const f = {};
    f.exam_type = selEl(['school|내신', 'mock|모의고사'], exam?.exam_type || 'mock');
    f.exam_name = h('input', { value: exam?.exam_name || '' });
    f.exam_date = h('input', { type: 'date', value: exam?.exam_date || today() });
    f.score = h('input', { type: 'number', min: '0', max: '100', value: exam?.score ?? '' });
    f.grade = h('input', { value: exam?.grade || '', placeholder: '예: 2' });
    f.strengths = h('textarea', {}, exam?.strengths || '');
    f.weakness = h('textarea', {}, exam?.weakness || '');
    f.feedback = h('textarea', {}, exam?.feedback || '');

    // OMR 1-45
    const items = exam?.items ? { ...exam.items } : {};
    const omrWrap = h('div', {});
    function buildOmr() {
      omrWrap.innerHTML = '';
      const grid = h('div', { class: 'omr-grid' });
      for (let i = 1; i <= 45; i++) {
        const cur = items[String(i)] || items[i];
        const ob = h('button', { type: 'button', class: 'o' + (cur === 'o' ? ' sel-o' : '') }, 'O');
        const xb = h('button', { type: 'button', class: 'x' + (cur === 'x' ? ' sel-x' : '') }, 'X');
        ob.onclick = () => { items[i] = items[i] === 'o' ? undefined : 'o'; if (items[i] === undefined) delete items[i]; buildOmr(); };
        xb.onclick = () => { items[i] = items[i] === 'x' ? undefined : 'x'; if (items[i] === undefined) delete items[i]; buildOmr(); };
        grid.appendChild(h('div', { class: 'omr-item' }, h('span', { class: 'n' }, i), h('div', { class: 'marks' }, ob, xb)));
      }
      omrWrap.appendChild(grid);
    }
    const omrSection = h('div', {},
      h('div', { class: 'hint', style: { margin: '0.5rem 0' } }, '모의고사 문항별 정답(O)·오답(X) 선택. 입력하지 않은 문항은 분석에서 제외됩니다.'),
      omrWrap);
    buildOmr();

    function refreshOmr() { omrSection.style.display = f.exam_type.value === 'mock' ? '' : 'none'; }
    f.exam_type.onchange = refreshOmr;
    setTimeout(refreshOmr, 0);

    const save = async () => {
      const body = {
        exam_type: f.exam_type.value, exam_name: f.exam_name.value, exam_date: f.exam_date.value,
        score: f.score.value !== '' ? Number(f.score.value) : null, grade: f.grade.value,
        strengths: f.strengths.value, weakness: f.weakness.value, feedback: f.feedback.value,
        items: f.exam_type.value === 'mock' ? items : null,
      };
      try {
        if (exam) await api.put(`/api/exams/${exam.id}`, body);
        else await api.post(`/api/students/${ctx.student.id}/exams`, body);
        toast('저장되었습니다.', 'success'); close(); ctx.reload();
      } catch (e) { toast(e.message, 'error'); }
    };

    return modalShell({
      title: exam ? '시험 기록 수정' : '시험 기록 추가', close,
      body: h('div', {},
        h('div', { class: 'form-grid' }, field('시험 종류', f.exam_type), field('시험명 *', f.exam_name), field('시험일 *', f.exam_date), field('점수', f.score), field('등급', f.grade)),
        field('잘한 점', f.strengths), field('약점', f.weakness), field('피드백', f.feedback),
        omrSection),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')],
    });
  });
}

async function delExam(ctx, e) {
  const ok = await confirmDialog(`'${e.exam_name}' 시험 기록을 삭제하시겠습니까?`, { title: '시험 기록 삭제', confirmText: '삭제' });
  if (!ok) return;
  try { await api.del(`/api/exams/${e.id}`); toast('삭제되었습니다.', 'success'); ctx.reload(); }
  catch (err) { toast(err.message, 'error'); }
}

function today() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function selEl(options, current) {
  const s = h('select');
  for (const opt of options) { const [v, l] = opt.split('|'); const o = h('option', { value: v }, l); if (v === current) o.selected = true; s.appendChild(o); }
  return s;
}
