import { h, openModal, modalShell, toast, confirmDialog, fmtCp } from '../../ui.js';
import { api } from '../../api.js';

const ATT_LABEL = { present: '출석', late: '지각', absent: '결석' };

export function renderAttendance(ctx) {
  const lessons = ctx.detail.lessons;
  const bonuses = ctx.detail.monthlyBonuses;
  const wrap = h('div', {});

  wrap.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.6rem' } },
    h('button', { class: 'btn sm', onClick: () => openAttendanceForm(ctx) }, '+ 독립 출결 기록'),
  ));

  // 출결 목록
  if (lessons.length) {
    const rows = lessons.map((l) =>
      h('tr', {},
        h('td', {}, l.lesson_date),
        h('td', {}, h('span', { class: 'pill ' + l.attendance }, ATT_LABEL[l.attendance])),
        h('td', {}, l.attendance === 'late' ? `${l.late_minutes}분` : '-'),
        h('td', { class: 'muted' }, l.attendance_only ? '독립 출결' : '수업 연결'),
      )
    );
    wrap.appendChild(h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, '날짜'), h('th', {}, '출결'), h('th', {}, '지각'), h('th', {}, '구분'))),
        h('tbody', {}, ...rows))));
  } else {
    wrap.appendChild(h('div', { class: 'empty' }, '출결 기록이 없습니다.'));
  }

  // 월간 보너스
  wrap.appendChild(h('h3', { style: { marginTop: '1rem', marginBottom: '0.5rem' } }, '월간 보너스'));
  wrap.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.5rem' } },
    h('button', { class: 'btn sm sage', onClick: () => computeBonus(ctx) }, '완료된 월 보너스 계산'),
  ));

  if (bonuses.length) {
    const brows = bonuses.map((b) =>
      h('tr', {},
        h('td', {}, b.month_key),
        h('td', { class: b.no_late_bonus ? 'pos' : 'muted' }, fmtCp(b.no_late_bonus)),
        h('td', { class: b.word_bonus ? 'pos' : 'muted' }, fmtCp(b.word_bonus)),
        h('td', { class: b.manual_adjust ? (b.manual_adjust > 0 ? 'pos' : 'neg') : 'muted' }, fmtCp(b.manual_adjust)),
        h('td', { style: { fontWeight: 700 } }, fmtCp(b.no_late_bonus + b.word_bonus + b.manual_adjust)),
        h('td', {},
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn sm secondary', onClick: () => adjustBonus(ctx, b) }, '수정'),
            h('button', { class: 'btn sm danger', onClick: () => removeBonus(ctx, b) }, '제거'),
          )
        )
      )
    );
    wrap.appendChild(h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, '월'), h('th', {}, '무지각'), h('th', {}, '단어성실'), h('th', {}, '수동조정'), h('th', {}, '합계'), h('th', {}, ''))),
        h('tbody', {}, ...brows))));
  }

  return wrap;
}

function openAttendanceForm(ctx) {
  openModal((close) => {
    const date = h('input', { type: 'date', value: today() });
    const att = selEl(['present|출석', 'late|지각', 'absent|결석'], 'late');
    const late = h('input', { type: 'number', min: '0', value: '0' });
    const save = async () => {
      try {
        await api.post(`/api/students/${ctx.student.id}/lessons`, {
          lesson_date: date.value, attendance: att.value,
          late_minutes: Number(late.value) || 0, word_status: 'none', attendance_only: true,
        });
        toast('출결이 기록되었습니다.', 'success');
        close(); ctx.reload();
      } catch (e) { toast(e.message, 'error'); }
    };
    return modalShell({
      title: '독립 출결 기록', close,
      body: h('div', {},
        h('div', { class: 'field' }, h('label', {}, '날짜'), date),
        h('div', { class: 'field' }, h('label', {}, '출결'), att),
        h('div', { class: 'field' }, h('label', {}, '지각 시간(분)'), late),
      ),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')],
    });
  });
}

function computeBonus(ctx) {
  openModal((close) => {
    const month = h('input', { type: 'month', value: prevMonth() });
    const run = async () => {
      try {
        await api.post(`/api/students/${ctx.student.id}/bonuses/${month.value}`, {});
        toast('월간 보너스가 계산되었습니다.', 'success');
        close(); ctx.reload();
      } catch (e) { toast(e.message, 'error'); }
    };
    return modalShell({
      title: '월간 보너스 계산', close,
      body: h('div', {},
        h('div', { class: 'hint', style: { marginBottom: '0.5rem' } }, '완료된 월을 선택하세요. 무지각·단어 성실 조건을 자동 평가합니다.'),
        h('div', { class: 'field' }, h('label', {}, '대상 월'), month)),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn sage', onClick: run }, '계산')],
    });
  });
}

function adjustBonus(ctx, b) {
  openModal((close) => {
    const adj = h('input', { type: 'number', value: b.manual_adjust });
    const run = async () => {
      try {
        await api.put(`/api/students/${ctx.student.id}/bonuses/${b.month_key}`, { manual_adjust: Number(adj.value) || 0 });
        toast('조정되었습니다.', 'success'); close(); ctx.reload();
      } catch (e) { toast(e.message, 'error'); }
    };
    return modalShell({
      title: `${b.month_key} 보너스 수동 조정`, close,
      body: h('div', { class: 'field' }, h('label', {}, '수동 조정액 (자동 보너스에 가감)'), adj),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: run }, '저장')],
    });
  });
}

async function removeBonus(ctx, b) {
  const ok = await confirmDialog(`${b.month_key} 월간 보너스를 제거하시겠습니까?`, { title: '보너스 제거', confirmText: '제거' });
  if (!ok) return;
  try { await api.del(`/api/students/${ctx.student.id}/bonuses/${b.month_key}`); toast('제거되었습니다.', 'success'); ctx.reload(); }
  catch (e) { toast(e.message, 'error'); }
}

function today() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function prevMonth() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
function selEl(options, current) {
  const s = h('select');
  for (const opt of options) { const [v, l] = opt.split('|'); const o = h('option', { value: v }, l); if (v === current) o.selected = true; s.appendChild(o); }
  return s;
}
