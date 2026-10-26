import { h, clear, loadingEl, toast } from '../../ui.js';
import { api } from '../../api.js';
import { captureText } from '../../png.js';
import { openGuideModal } from '../guide.js';
import { state } from '../../state.js';

export function renderGuideSection(ctx) {
  const wrap = h('div', {});
  const view = h('div', {});
  wrap.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.6rem' } },
    h('button', { class: 'btn sm secondary', onClick: () => openGuideModal(state.teacher) }, '✏ 편집'),
    h('button', { class: 'btn sm orange', onClick: capture }, '🖼 PNG 캡처'),
    h('button', { class: 'btn sm ghost', onClick: load }, '🔄 새로고침')));
  wrap.appendChild(view);
  load();
  return wrap;

  let guideContent = '';

  async function load() {
    clear(view);
    view.appendChild(loadingEl());
    try {
      const { guide } = await api.get(`/api/teachers/${state.teacher.id}/guide`);
      guideContent = guide.content || '';
      clear(view);
      const captureBox = h('div', { id: 'guideCapture', style: { background: '#fffdf8', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e5d8c4', whiteSpace: 'pre-wrap' }, class: 'wrap-anywhere' },
        guideContent || '아직 안내문이 없습니다. “편집”에서 작성하거나 “기본 초안 생성”을 사용하세요.');
      view.appendChild(captureBox);
    } catch (e) {
      clear(view);
      view.appendChild(h('div', { class: 'error-box' }, e.message));
    }
  }

  async function capture() {
    if (!guideContent.trim()) { toast('먼저 안내문을 작성하세요.', 'error'); return; }
    try {
      await captureText('CP 매니저 의의 및 규칙', guideContent, `CP매니저_의의규칙_${state.teacher.name}.png`);
      toast('이미지를 저장했습니다.', 'success');
    } catch (e) { toast('이미지 저장 실패: ' + e.message, 'error'); }
  }
}
