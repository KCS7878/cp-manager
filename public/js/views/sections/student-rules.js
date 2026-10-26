import { h, toast } from '../../ui.js';
import { api } from '../../api.js';
import { state } from '../../state.js';

const FIELDS = [
  ['word_pass_score', '단어 통과 기준 점수'],
  ['pass_in_time_cp', '기한 내 통과 CP'],
  ['perfect_bonus_cp', '만점 보너스 CP'],
  ['pass_late_cp', '기한 이후 통과 CP'],
  ['no_show_cp', '미응시 CP'],
  ['late_grace_min', '지각 인정 기준(분)'],
  ['late_penalty_per_min', '지각 1분당 차감 CP'],
  ['monthly_no_late_bonus', '월간 무지각 보너스'],
  ['monthly_word_bonus', '월간 단어 성실 보너스'],
];

export function renderStudentRules(ctx) {
  const override = ctx.detail.override || {};
  const base = state.rules || {};
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'hint', style: { marginBottom: '0.6rem' } },
    '값을 비우면 강사 공통 규칙을 따릅니다. 입력하면 이 학생에게만 예외 규칙이 적용됩니다.'));

  const inputs = {};
  const grid = h('div', { class: 'form-grid' });
  for (const [key, label] of FIELDS) {
    const inp = h('input', { type: 'number', placeholder: `공통: ${base[key] ?? '-'}`, value: override[key] ?? '' });
    inputs[key] = inp;
    grid.appendChild(h('div', { class: 'field' }, h('label', {}, label), inp));
  }
  wrap.appendChild(grid);

  wrap.appendChild(h('div', { class: 'btn-row', style: { marginTop: '0.6rem' } },
    h('button', { class: 'btn', onClick: save }, '예외 규칙 저장')));

  return wrap;

  async function save() {
    const body = {};
    for (const [key] of FIELDS) {
      const v = inputs[key].value;
      body[key] = v === '' ? null : Number(v);
    }
    try {
      await api.put(`/api/students/${ctx.student.id}/rules`, body);
      toast('예외 규칙이 저장되었습니다. (적용은 이후 기록부터)', 'success');
      ctx.reload();
    } catch (e) { toast(e.message, 'error'); }
  }
}
