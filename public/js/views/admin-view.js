// 총관리자 화면: 전체 강사 관리(추가/수정/삭제/코드 확인/해당 강사로 진입).
import { h, clear, toast, loadingEl, errorEl, openModal, modalShell, confirmDialog } from '../ui.js';
import { api } from '../api.js';

export async function renderAdminView(root, { onEnterTeacher, onExit } = {}) {
  clear(root);
  root.appendChild(loadingEl('전체 강사 목록을 불러오는 중...'));

  async function load() {
    clear(root);
    root.appendChild(loadingEl('불러오는 중...'));
    let teachers;
    try {
      const res = await api.get('/api/admin/teachers');
      teachers = res.teachers;
    } catch (e) {
      clear(root);
      root.appendChild(errorEl(new Error('강사 목록을 불러오지 못했습니다: ' + e.message), load));
      return;
    }
    paint(teachers);
  }

  function paint(teachers) {
    clear(root);
    const wrap = h('div', { class: 'admin-view' });

    wrap.appendChild(h('div', { class: 'admin-head' },
      h('div', {},
        h('div', { class: 'admin-title' }, '🛡 총관리자 — 강사 관리'),
        h('div', { class: 'muted' }, `등록된 강사 ${teachers.length}명`),
      ),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onClick: () => openTeacherEditor(null, load) }, '＋ 새 강사 추가'),
        onExit ? h('button', { class: 'btn secondary', onClick: onExit }, '나가기') : null,
      )
    ));

    if (!teachers.length) {
      wrap.appendChild(h('div', { class: 'card' }, h('div', { class: 'section-body empty' }, '등록된 강사가 없습니다. “새 강사 추가”로 시작하세요.')));
      root.appendChild(wrap);
      return;
    }

    const grid = h('div', { class: 'admin-teacher-grid' });
    for (const t of teachers) {
      grid.appendChild(h('div', { class: 'admin-teacher-card' },
        h('div', { class: 'atc-head' },
          h('div', { class: 'atc-avatar', style: { background: t.color || '#ee735a' } }, (t.name || '?').slice(0, 1)),
          h('div', { class: 'atc-info' },
            h('div', { class: 'atc-name wrap-anywhere' }, t.name),
            h('div', { class: 'atc-count muted' }, `담당 학생 ${t.student_count}명`),
          ),
        ),
        h('div', { class: 'atc-code' },
          h('span', { class: 'muted' }, '접속 코드'),
          h('code', { class: 'atc-code-val' }, t.access_code || '-'),
          h('button', { class: 'code-copy', onClick: () => copyText(t.access_code) }, '복사'),
        ),
        h('div', { class: 'btn-row atc-actions' },
          h('button', { class: 'btn sm', onClick: () => onEnterTeacher && onEnterTeacher(t) }, '관리 화면 열기'),
          h('button', { class: 'btn sm secondary', onClick: () => openTeacherEditor(t, load) }, '수정'),
          h('button', { class: 'btn sm danger', onClick: () => delTeacher(t, load) }, '삭제'),
        )
      ));
    }
    wrap.appendChild(grid);
    wrap.appendChild(h('div', { class: 'admin-foot muted' }, '강사를 삭제하면 그 강사의 학생·기록·상품이 모두 함께 삭제됩니다. 신중히 처리하세요.'));
    root.appendChild(wrap);
  }

  await load();
}

function openTeacherEditor(teacher, onSaved) {
  openModal((close) => {
    const name = h('input', { value: teacher?.name || '', placeholder: '강사 이름' });
    const color = h('input', { type: 'color', value: teacher?.color || '#ee735a' });
    const save = async () => {
      if (!name.value.trim()) { toast('강사 이름을 입력하세요.', 'error'); return; }
      try {
        if (teacher) await api.put(`/api/teachers/${teacher.id}`, { name: name.value, color: color.value });
        else await api.post('/api/teachers', { name: name.value, color: color.value });
        toast('저장되었습니다.', 'success');
        close();
        onSaved && onSaved();
      } catch (e) { toast(e.message, 'error'); }
    };
    return modalShell({
      title: teacher ? '강사 수정' : '새 강사 추가', close,
      body: h('div', {},
        h('div', { class: 'field' }, h('label', {}, '강사 이름'), name),
        h('div', { class: 'field' }, h('label', {}, '카드 색상'), color),
        !teacher ? h('p', { class: 'muted', style: { fontSize: '0.82rem' } }, '저장하면 선생님 접속 코드가 자동으로 발급됩니다.') : null,
      ),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')],
    });
  });
}

async function delTeacher(t, onDone) {
  const ok = await confirmDialog(
    `'${t.name}' 강사를 삭제하시겠습니까?`,
    { title: '강사 삭제', confirmText: '삭제', detail: `이 강사의 담당 학생 ${t.student_count}명과 그들의 모든 기록(수업·시험·CP·상품)이 함께 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.` }
  );
  if (!ok) return;
  try { await api.del(`/api/teachers/${t.id}`); toast('삭제되었습니다.', 'success'); onDone && onDone(); }
  catch (e) { toast(e.message, 'error'); }
}

function copyText(txt) {
  if (!txt) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(() => toast('복사되었습니다.', 'success')).catch(() => toast('복사 실패. 직접 선택해 복사하세요.', 'error'));
  } else toast('이 브라우저에서는 자동 복사가 안 됩니다. 직접 복사하세요.', 'info');
}
