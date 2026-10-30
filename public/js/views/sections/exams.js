import { h, openModal, modalShell, toast, confirmDialog } from '../../ui.js';
import { api } from '../../api.js';

export function renderExams(ctx) {
  const exams = ctx.detail.exams;
  const analysis = ctx.detail.examAnalysis;
  const wrap = h('div', {});

  wrap.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.6rem' } },
    h('button', { class: 'btn sm', onClick: () => openExamForm(ctx, null) }, '+ 시험 기록 추가')));

  // 학생이 제출한 점수(승인 대기) — 있으면 상단에 눈에 띄게 표시
  const pending = exams.filter((e) => e.submitted_by === 'student' && e.status === 'pending');
  if (pending.length) {
    wrap.appendChild(renderPendingExams(ctx, pending));
  }

  // 추세 + 목표
  if (analysis) {
    const goals = analysis.goals;
    wrap.appendChild(h('div', { class: 'summary-grid', style: { marginBottom: '0.75rem' } },
      miniTrend('모의고사', analysis.mockTrend, goals.mock),
      miniTrend('내신', analysis.schoolTrend, goals.school),
    ));

    // 점수 막대그래프 (모의고사 / 내신)
    const mockChart = renderScoreChart('모의고사 점수 추이', analysis.mockTrend, goals.mock);
    const schoolChart = renderScoreChart('내신 점수 추이', analysis.schoolTrend, goals.school);
    if (mockChart) wrap.appendChild(mockChart);
    if (schoolChart) wrap.appendChild(schoolChart);

    if (analysis.weakTypes && analysis.weakTypes.length) {
      wrap.appendChild(h('div', { class: 'hint', style: { marginBottom: '0.6rem' } },
        '반복 취약 유형: ' + analysis.weakTypes.map((t) => `${t.type}(${t.rate}%)`).join(', ')));
    }
  }

  // 정식(확정) 기록만 아래 목록에 표시. 학생 제출(pending)은 위의 승인 섹션에서 처리.
  const confirmedExams = exams.filter((e) => (e.status || 'confirmed') === 'confirmed');
  if (!confirmedExams.length) {
    wrap.appendChild(h('div', { class: 'empty' }, '시험 기록이 없습니다.'));
    return wrap;
  }

  const rows = confirmedExams.map((e) =>
    h('tr', {},
      h('td', { 'data-label': '종류' }, e.exam_type === 'mock' ? '모의고사' : '내신'),
      h('td', { 'data-label': '시험명', class: 'wrap-anywhere' }, e.exam_name),
      h('td', { 'data-label': '시험일' }, e.exam_date),
      h('td', { 'data-label': '점수' }, e.score != null ? `${e.score}점` : '-'),
      h('td', { 'data-label': '등급' }, e.grade || '-'),
      h('td', { 'data-label': '약점', class: 'wrap-anywhere' }, e.weakness || '-'),
      h('td', { 'data-label': '' }, h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm secondary', onClick: () => openExamForm(ctx, e) }, '수정'),
        h('button', { class: 'btn sm danger', onClick: () => delExam(ctx, e) }, '삭제'))))
  );
  wrap.appendChild(h('div', { class: 'card-table' },
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, '종류'), h('th', {}, '시험명'), h('th', {}, '시험일'), h('th', {}, '점수'), h('th', {}, '등급'), h('th', {}, '약점'), h('th', {}, ''))),
        h('tbody', {}, ...rows)))));
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

// 내신/모의고사 점수 막대그래프. trend 는 과거→현재 순 [{date,name,score,grade}].
// 점수(0~100)에 비례한 높이. 목표가 점수형이면 목표선 + 달성(초록)/미달(주황),
// 목표 미정이면 중립색(남색).
const EX_PLOT_PX = 170;   // 플롯(막대+라벨) 전체 높이
const EX_BAR_MAX = 120;   // 100점 막대 최대 높이 (영역을 넘지 않게)
const EX_LABEL_PX = 42;   // 막대 아래 값/날짜 라벨 영역 높이 (목표선 보정값)
function renderScoreChart(title, trend, goal) {
  if (!trend || !trend.length) return null;
  const scored = trend.filter((e) => e.score != null).slice(-10); // 최근 10회
  if (!scored.length) return null;

  const hasGoal = goal && goal.type === 'score' && goal.value;
  const goalVal = hasGoal ? Number(goal.value) : null;

  const bars = scored.map((e) => {
    const score = Number(e.score) || 0;
    let cls;
    if (hasGoal) cls = score >= goalVal ? 'bar-green' : 'bar-orange';
    else cls = 'bar-navy';
    const barPx = Math.max(10, Math.round((score / 100) * EX_BAR_MAX));
    const label = hasGoal ? `${score}점 (목표 ${goalVal}점 ${score >= goalVal ? '달성' : '미달'})` : `${score}점`;
    return h('div', { class: 'wc-col', title: `${e.date} · ${e.name} · ${label}` },
      h('div', { class: `wc-bar ${cls}`, style: { height: barPx + 'px' } }),
      h('div', { class: 'wc-val' }, String(score)),
      h('div', { class: 'wc-date' }, (e.date || '').slice(5)),
    );
  });

  const legend = hasGoal
    ? h('span', { class: 'wc-legend' },
        h('span', { class: 'wc-dot bar-green' }), '목표 달성 ',
        h('span', { class: 'wc-dot bar-orange' }), '목표 미달')
    : h('span', { class: 'wc-legend' }, '목표 미설정');

  const passline = hasGoal
    ? h('div', { class: 'wc-passline ex-goalline', style: { bottom: (Math.round((goalVal / 100) * EX_BAR_MAX) + EX_LABEL_PX) + 'px' }, title: `목표 ${goalVal}점` })
    : null;

  return h('div', { class: 'word-chart' },
    h('div', { class: 'wc-head' }, h('strong', {}, title), legend),
    h('div', { class: 'wc-plot', style: { height: EX_PLOT_PX + 'px' } }, passline, ...bars),
  );
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

// 학생이 제출한 점수(승인 대기) 목록 + 승인/거절
function renderPendingExams(ctx, pending) {
  const EXAM_LABEL = { school: '내신', mock: '모의고사' };
  const rows = pending.map((e) => h('tr', {},
    h('td', { 'data-label': '종류' }, EXAM_LABEL[e.exam_type] || e.exam_type),
    h('td', { 'data-label': '시험명', class: 'wrap-anywhere' }, e.exam_name),
    h('td', { 'data-label': '시험일' }, e.exam_date),
    h('td', { 'data-label': '점수' }, (e.score != null ? `${e.score}점` : '-') + (e.grade ? ` (${e.grade}등급)` : '')),
    h('td', { 'data-label': '' }, h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm sage', onClick: () => confirmExam(ctx, e) }, '승인'),
      h('button', { class: 'btn sm danger', onClick: () => rejectExam(ctx, e) }, '거절'),
    )),
  ));
  return h('div', { class: 'pending-exams', style: { marginBottom: '0.9rem' } },
    h('div', { class: 'pending-head' },
      h('strong', {}, `🙋 학생이 제출한 점수 ${pending.length}건`),
      h('span', { class: 'muted', style: { fontSize: '0.8rem' } }, '승인하면 성적·분석에 반영됩니다.'),
    ),
    h('div', { class: 'card-table' }, h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, '종류'), h('th', {}, '시험명'), h('th', {}, '시험일'), h('th', {}, '점수'), h('th', {}, ''))),
        h('tbody', {}, ...rows)))),
  );
}

async function confirmExam(ctx, e) {
  try {
    await api.post(`/api/exams/${e.id}/confirm`, {});
    toast('승인되었습니다. 성적에 반영됩니다.', 'success');
    ctx.reload();
  } catch (err) { toast(err.message, 'error'); }
}

async function rejectExam(ctx, e) {
  const ok = await confirmDialog(`'${e.exam_name}' (${e.score != null ? e.score + '점' : ''}) 제출을 거절(삭제)하시겠습니까?`,
    { title: '제출 거절', confirmText: '거절', detail: '학생이 제출한 이 점수가 삭제됩니다.' });
  if (!ok) return;
  try { await api.del(`/api/exams/${e.id}`); toast('거절되었습니다.', 'success'); ctx.reload(); }
  catch (err) { toast(err.message, 'error'); }
}

function today() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function selEl(options, current) {
  const s = h('select');
  for (const opt of options) { const [v, l] = opt.split('|'); const o = h('option', { value: v }, l); if (v === current) o.selected = true; s.appendChild(o); }
  return s;
}
