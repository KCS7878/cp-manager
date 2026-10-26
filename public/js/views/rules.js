import { h, openModal, modalShell, toast } from '../ui.js';
import { api } from '../api.js';

const NUM_FIELDS = [
  ['word_pass_score', '단어 통과 기준 점수'],
  ['pass_in_time_cp', '기한 내 통과 CP'],
  ['perfect_bonus_cp', '만점 보너스 CP'],
  ['pass_late_cp', '기한 이후 통과 CP'],
  ['no_show_cp', '미응시 CP'],
  ['late_grace_min', '지각 인정 기준(분)'],
  ['late_penalty_per_min', '지각 1분당 차감 CP'],
  ['monthly_no_late_bonus', '월간 무지각 보너스'],
  ['monthly_word_bonus', '월간 단어 성실 보너스'],
  ['participation_stack3_cp', '참여 3스택 보너스'],
];
const TOGGLES = [
  ['show_quarter_title', '분기 칭호 표시'],
  ['show_perfect_attend', '개근상 표시'],
  ['show_day_streak', '단어시험 DAY STREAK 표시'],
];

export function openRulesModal(teacher, rules, onSaved) {
  openModal((close) => {
    const inputs = {};
    const grid = h('div', { class: 'form-grid' });
    for (const [key, label] of NUM_FIELDS) {
      const inp = h('input', { type: 'number', value: rules[key] ?? '' });
      inputs[key] = inp;
      grid.appendChild(h('div', { class: 'field' }, h('label', {}, label), inp));
    }
    const toggleWrap = h('div', {});
    for (const [key, label] of TOGGLES) {
      const cb = h('input', { type: 'checkbox' });
      if (rules[key]) cb.checked = true;
      inputs[key] = cb;
      toggleWrap.appendChild(h('label', { style: { display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.3rem' } }, cb, label + ' (기본 OFF)'));
    }

    const save = async () => {
      const body = {};
      for (const [key] of NUM_FIELDS) body[key] = Number(inputs[key].value);
      for (const [key] of TOGGLES) body[key] = inputs[key].checked;
      try {
        const res = await api.put(`/api/teachers/${teacher.id}/rules`, body);
        toast('규칙이 저장되었습니다.', 'success');
        close();
        onSaved && onSaved(res.rules);
      } catch (e) { toast(e.message, 'error'); }
    };

    return modalShell({
      title: `${teacher.name} 선생님 · CP 공통 규칙`, close,
      body: h('div', {},
        grid,
        h('h4', { style: { marginBottom: '0.5rem' } }, '랭킹 심볼'),
        toggleWrap),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')],
    });
  });
}
