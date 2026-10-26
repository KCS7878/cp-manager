import { h, openModal, modalShell, toast } from '../ui.js';
import { api } from '../api.js';
import { captureToPng } from '../png.js';

export function openGuideModal(teacher) {
  openModal(async (close) => {
    const shell = modalShell({
      title: '의의 및 규칙 편집', close,
      body: h('div', { class: 'loading-box' }, '불러오는 중...'),
      footer: [],
    });
    // 비동기 로드 후 교체
    loadInto(shell, teacher, close);
    return shell;
  });
}

async function loadInto(shell, teacher, close) {
  const body = shell.querySelector('.modal-body');
  const foot = shell.querySelector('.modal-foot');
  let guide;
  try {
    const res = await api.get(`/api/teachers/${teacher.id}/guide`);
    guide = res.guide;
  } catch (e) { body.textContent = '불러오기 실패: ' + e.message; return; }

  const ta = h('textarea', { style: { minHeight: '320px' }, maxlength: '12000' }, guide.content || '');
  const counter = h('div', { class: 'muted', style: { textAlign: 'right' } });
  const updateCount = () => counter.textContent = `${ta.value.length} / 12,000자`;
  ta.oninput = updateCount;

  body.innerHTML = '';
  body.appendChild(h('div', { class: 'hint', style: { marginBottom: '0.5rem' } }, '학생에게 공유할 안내문입니다. “기본 초안 생성”으로 현재 규칙을 반영한 초안을 채울 수 있습니다.'));
  body.appendChild(h('div', { class: 'field' }, h('label', {}, '내용'), ta, counter));
  updateCount();

  foot.innerHTML = '';
  foot.appendChild(h('button', { class: 'btn secondary', onClick: async () => {
    try { const { draft } = await api.get(`/api/teachers/${teacher.id}/guide/draft`); ta.value = draft; updateCount(); toast('초안을 생성했습니다.', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  } }, '기본 초안 생성'));
  foot.appendChild(h('button', { class: 'btn', onClick: async () => {
    try { await api.put(`/api/teachers/${teacher.id}/guide`, { content: ta.value }); toast('저장되었습니다.', 'success'); close(); }
    catch (e) { toast(e.message, 'error'); }
  } }, '저장'));
}
