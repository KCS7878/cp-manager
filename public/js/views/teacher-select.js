import { h, openModal, modalShell, toast } from '../ui.js';
import { api } from '../api.js';

export function renderTeacherSelect(teachers, onSelect, { stale = false, onChanged } = {}) {
  const grid = h('div', { class: 'teacher-select-grid' });

  for (const t of teachers) {
    grid.appendChild(
      h('div', { class: 'teacher-row-card', tabindex: '0', role: 'button',
        onClick: () => onSelect(t),
        onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(t); } },
      },
        h('div', { class: 't-avatar', style: { background: t.color || '#ee735a' } }, (t.name || '?').slice(0, 1)),
        h('div', { class: 't-info' },
          h('div', { class: 't-name wrap-anywhere' }, `${t.name} 강사`),
          h('div', { class: 't-count' }, `담당 학생 관리로 들어가기`)
        ),
        h('span', { class: 't-arrow' }, '→')
      )
    );
  }

  // 새 강사 추가 (인라인 입력)
  const nameInput = h('input', { placeholder: '강사 이름', class: 'teacher-add-input' });
  const addBtn = h('button', { class: 'btn', onClick: addTeacher }, '추가하고 접속');
  nameInput.onkeydown = (e) => { if (e.key === 'Enter') addTeacher(); };

  async function addTeacher() {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    try {
      const { teacher } = await api.post('/api/teachers', { name });
      // 생성 후 바로 해당 강사로 접속
      onSelect(teacher);
    } catch (e) { toast(e.message, 'error'); }
  }

  return h('div', { class: 'teacher-select-wrap' },
    h('div', { class: 'card teacher-select-card' },
      h('div', { class: 'section-body' },
        h('div', { class: 'ts-brand' },
          h('div', { class: 'ts-logo' }, 'CP'),
          h('div', {},
            h('div', { class: 'ts-brand-title' }, '학생 학습 관리'),
            h('div', { class: 'ts-brand-sub' }, '강사별 수업·보상 관리')
          )
        ),
        h('div', { class: 'ts-divider' }),
        h('div', { class: 'ts-eyebrow' }, '강사 선택'),
        h('h2', { class: 'ts-title' }, '어떤 강사로 접속할까요?'),
        h('p', { class: 'muted ts-desc' }, '로그인 없이, 어떤 선생님의 해당 강사의 학생·CP 규칙과 상품 목록으로 들어갑니다.'),
        stale ? h('div', { class: 'hint', style: { marginBottom: '0.75rem' } }, '⚠️ 현재 캐시된 목록을 표시 중입니다. 서버 연결 복구 후 다시 시도하세요.') : null,
        grid,
        h('div', { class: 'ts-add-label' }, '새 강사 추가'),
        h('div', { class: 'teacher-add-row' }, nameInput, addBtn),
        h('p', { class: 'muted ts-note' }, '강사 선택 후 화면 상단 “강사 변경”에서 언제든 바꿀 수 있습니다.')
      )
    )
  );
}

export function openTeacherForm(onChanged, teacher = null) {
  openModal((close) => {
    const name = h('input', { value: teacher?.name || '', placeholder: '강사명' });
    const color = h('input', { type: 'color', value: teacher?.color || '#ee735a' });
    const save = async () => {
      try {
        if (teacher) await api.put(`/api/teachers/${teacher.id}`, { name: name.value, color: color.value });
        else await api.post('/api/teachers', { name: name.value, color: color.value });
        toast('저장되었습니다.', 'success');
        close();
        onChanged && onChanged();
      } catch (e) { toast(e.message, 'error'); }
    };
    return modalShell({
      title: teacher ? '강사 수정' : '강사 추가',
      close,
      body: h('div', {},
        h('div', { class: 'field' }, h('label', {}, '강사명'), name),
        h('div', { class: 'field' }, h('label', {}, '카드 색상'), color)
      ),
      footer: [
        h('button', { class: 'btn secondary', onClick: close }, '취소'),
        h('button', { class: 'btn', onClick: save }, '저장'),
      ],
    });
  });
}
