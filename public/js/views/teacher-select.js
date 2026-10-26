import { h, openModal, modalShell, toast } from '../ui.js';
import { api } from '../api.js';

export function renderTeacherSelect(teachers, onSelect, { stale = false, onChanged } = {}) {
  const grid = h('div', { class: 'teacher-grid' });

  for (const t of teachers) {
    grid.appendChild(
      h('div', { class: 'teacher-card', tabindex: '0', role: 'button',
        onClick: () => onSelect(t),
        onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(t); } },
      },
        h('div', { class: 't-avatar', style: { background: t.color || '#ee735a' } }, (t.name || '?').slice(0, 1)),
        h('div', { class: 't-name wrap-anywhere' }, t.name),
        h('div', { class: 't-count' }, `담당 학생 ${t.student_count ?? 0}명`)
      )
    );
  }

  // 강사 추가 카드
  grid.appendChild(
    h('div', { class: 'teacher-card', style: { borderStyle: 'dashed' }, tabindex: '0', role: 'button',
      onClick: () => openTeacherForm(onChanged),
      onKeydown: (e) => { if (e.key === 'Enter') openTeacherForm(onChanged); },
    },
      h('div', { class: 't-avatar', style: { background: '#e5d8c4' } }, '+'),
      h('div', { class: 't-name' }, '강사 추가')
    )
  );

  return h('div', { class: 'card' },
    h('div', { class: 'section-body' },
      h('h2', { style: { marginTop: 0 } }, '강사를 선택하세요'),
      h('p', { class: 'muted' }, '강사 선택은 로그인이 아니라, 해당 강사의 학생·규칙·상품을 불러오기 위한 작업 범위 선택입니다.'),
      stale ? h('div', { class: 'hint', style: { marginBottom: '0.75rem' } }, '⚠️ 현재 캐시된 목록을 표시 중입니다. 서버 연결 복구 후 다시 시도하세요.') : null,
      grid
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
