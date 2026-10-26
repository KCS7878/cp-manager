import { h, clear, toast, loadingEl, errorEl } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { renderDetail } from './detail.js';
import { openStudentForm } from './student-form.js';
import { openRulesModal } from './rules.js';
import { openGuideModal } from './guide.js';
import { openRanking } from './ranking.js';
import { openRemote } from './remote.js';
import { openBackup } from './backup.js';
import { openWordWidget } from './word-widget.js';

const SECTION_KEYS = [
  'summary', 'ledger', 'coach', 'lessons', 'attendance', 'exams', 'rules', 'guide', 'shop',
];

// 하단 내비게이션: 라벨/아이콘 -> 동작(섹션 펼치고 스크롤 or 모달)
const NAV_ITEMS = [
  { key: 'summary', icon: '🏠', label: '대시보드', type: 'section' },
  { key: 'lessons', icon: '📘', label: '학습 기록', type: 'section' },
  { key: 'attendance', icon: '✔', label: '출결', type: 'section' },
  { key: 'exams', icon: '◈', label: '내신 관리', type: 'section' },
  { key: 'ledger', icon: '◆', label: 'CP 지급 내역', type: 'section' },
  { key: 'remote', icon: '＋', label: 'CP 매니저 리모콘', type: 'remote' },
  { key: 'ranking', icon: '👑', label: 'CP 랭킹', type: 'ranking' },
  { key: 'backup', icon: '⇄', label: 'PC 프로그램', type: 'backup' },
  { key: 'rules', icon: '⚙', label: 'CP 규칙', type: 'section' },
  { key: 'guide', icon: 'ⓘ', label: '의의 및 규칙', type: 'section' },
  { key: 'shop', icon: '★', label: '상점·인벤토리', type: 'section' },
];

export function renderWorkspace(root, App) {
  clear(root);
  const grid = h('div', { class: 'main-grid' });
  const sidebar = h('div', { class: 'sidebar' });
  const detailPane = h('div', { class: 'detail-pane' });
  grid.appendChild(sidebar);
  grid.appendChild(detailPane);
  root.appendChild(grid);

  renderSidebar(sidebar, detailPane, App);

  if (state.students.length) {
    selectStudent(state.students[0].id, detailPane, sidebar, App);
  } else {
    detailPane.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-body empty' }, '담당 학생이 없습니다. 좌측 “학생 분류”의 + 버튼으로 학생을 추가하세요.')
    ));
  }

  document.addEventListener('cp:students-updated', () => { sidebar.__paintList && sidebar.__paintList(); });
}

function renderSidebar(sidebar, detailPane, App) {
  clear(sidebar);
  const t = state.teacher;
  const listEl = h('div', { class: 'student-list' });
  const gradeWrap = h('div', { class: 'grade-step-wrap' });
  const schoolBox = h('div', { class: 'filter-check-list' });
  const classBox = h('div', { class: 'filter-check-list' });
  const nameInput = h('input', { placeholder: '학생·학교·분반·강사 검색', value: state.filters.name || '', class: 'side-search' });
  const sortSel = segSelect(['name|가나다순', 'cp_desc|CP 많은순', 'cp_asc|CP 적은순'], state.filters.sort);

  // ── 공통 apply ──
  const apply = async () => {
    state.filters.name = nameInput.value || undefined;
    state.filters.sort = sortSel.value;
    listEl.innerHTML = '';
    listEl.appendChild(loadingEl('목록 갱신 중...'));
    await App.refreshStudents();
    paintList();
  };

  // ── 담당/전체 토글 ──
  const scopeToggle = h('div', { class: 'seg-group' },
    segBtn('담당 학생', () => state.filters.scope === 'mine', () => { state.filters.scope = 'mine'; refreshToggles(); apply(); }),
    segBtn('전체 학생 나열', () => state.filters.scope === 'all', () => { state.filters.scope = 'all'; refreshToggles(); apply(); }),
  );

  // ── 학교급 선택 ──
  const levelGroup = h('div', { class: 'seg-group three' },
    segBtn('전체', () => !state.filters.level, () => { state.filters.level = undefined; state.filters.grade = ''; refreshToggles(); renderGradeStep(); apply(); }),
    segBtn('중학생', () => state.filters.level === 'middle', () => { state.filters.level = 'middle'; state.filters.grade = ''; refreshToggles(); renderGradeStep(); apply(); }),
    segBtn('고등학생', () => state.filters.level === 'high', () => { state.filters.level = 'high'; state.filters.grade = ''; refreshToggles(); renderGradeStep(); apply(); }),
  );

  function renderGradeStep() {
    clear(gradeWrap);
    const lv = state.filters.level;
    if (lv !== 'middle' && lv !== 'high') return;
    const grades = lv === 'middle' ? ['중1', '중2', '중3'] : ['고1', '고2', '고3'];
    const step = h('div', { class: 'grade-step' });
    step.appendChild(gradeChip('전체', !state.filters.grade, () => { state.filters.grade = ''; renderGradeStep(); apply(); }));
    for (const g of grades) step.appendChild(gradeChip(g, state.filters.grade === g, () => { state.filters.grade = g; renderGradeStep(); apply(); }));
    gradeWrap.appendChild(step);
  }

  // ── 학교 체크 목록 (단일 활성 필터) ──
  function renderSchools() {
    clear(schoolBox);
    if (!state.schools.length) { schoolBox.appendChild(h('div', { class: 'filter-empty' }, '등록된 학교 없음')); return; }
    for (const s of state.schools) {
      const active = state.filters.school === s.name;
      schoolBox.appendChild(checkRow(s.name, active, () => {
        state.filters.school = active ? undefined : s.name;
        renderSchools(); apply();
      }));
    }
  }

  // ── 분반 체크 목록 ──
  function renderClasses() {
    clear(classBox);
    if (!state.classes.length) { classBox.appendChild(h('div', { class: 'filter-empty' }, '등록된 분반 없음')); return; }
    for (const c of state.classes) {
      const active = state.filters.className === c;
      classBox.appendChild(checkRow(c, active, () => {
        state.filters.className = active ? undefined : c;
        renderClasses(); apply();
      }));
    }
  }

  function refreshToggles() {
    scopeToggle.querySelectorAll('.seg-btn').forEach((b) => b.__sync && b.__sync());
    levelGroup.querySelectorAll('.seg-btn').forEach((b) => b.__sync && b.__sync());
  }

  sortSel.onchange = () => apply();
  let nameTimer;
  nameInput.oninput = () => { clearTimeout(nameTimer); nameTimer = setTimeout(apply, 300); };

  // ── 학생 목록 ──
  function paintList() {
    clear(listEl);
    if (!state.students.length) { listEl.appendChild(h('div', { class: 'empty' }, '조건에 맞는 학생이 없습니다.')); return; }
    for (const s of state.students) {
      const meta = [s.grade, `${s.available_cp} CP`, t.name, s.class_name].filter(Boolean).join(' · ');
      listEl.appendChild(h('div', {
        class: 'student-item' + (s.id === state.selectedStudentId ? ' active' : ''),
        tabindex: '0', role: 'button', dataset: { sid: s.id },
        onClick: () => selectStudent(s.id, detailPane, sidebar, App),
        onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStudent(s.id, detailPane, sidebar, App); } },
      },
        h('div', { class: 'si-avatar', style: { background: t.color || '#ee735a' } }, (s.name || '?').slice(0, 1)),
        h('div', { class: 'si-body' },
          h('div', { class: 's-name wrap-anywhere' }, s.name),
          h('div', { class: 's-meta wrap-anywhere' }, meta)
        )
      ));
    }
  }

  // ── 하단 내비게이션 ──
  const navEl = h('nav', { class: 'side-nav' });
  for (const item of NAV_ITEMS) {
    navEl.appendChild(h('button', { class: 'nav-item', dataset: { nav: item.key },
      onClick: () => handleNav(item, detailPane, navEl) },
      h('span', { class: 'nav-icon' }, item.icon),
      h('span', { class: 'nav-label' }, item.label)
    ));
  }

  // ── 강사 자동 규칙 요약 카드 ──
  const r = state.rules || {};
  const ruleCard = h('div', { class: 'rule-summary-card', role: 'button', tabindex: '0',
    onClick: () => openRulesModal(state.teacher, state.rules, (nr) => { state.rules = nr; renderSidebar(sidebar, detailPane, App); selectStudentKeepActive(detailPane, sidebar, App); }),
    onKeydown: (e) => { if (e.key === 'Enter') e.target.click(); } },
    h('div', { class: 'rule-summary-title' }, `${t.name} 강사 자동 규칙`),
    h('div', { class: 'rule-summary-sub' }, `단어시험 ${r.word_pass_score ?? 80}점 이상 · 기한 내`),
    h('div', { class: 'rule-summary-cp' }, `+${r.pass_in_time_cp ?? 10} CP · 만점 +${(r.pass_in_time_cp ?? 10) + (r.perfect_bonus_cp ?? 5)}`)
  );

  // ── 조립 ──
  renderGradeStep(); renderSchools(); renderClasses();

  sidebar.appendChild(h('div', { class: 'sidebar-inner' },
    // 브랜딩
    h('div', { class: 'side-brand' },
      h('div', { class: 'side-logo' }, 'CP'),
      h('div', {},
        h('div', { class: 'side-brand-title' }, '학생 학습 관리'),
        h('div', { class: 'side-brand-sub' }, `${t.name} 강사 화면`)
      )
    ),
    h('div', { class: 'ts-divider' }),

    // 학생 분류
    h('div', { class: 'side-section-head' },
      h('span', { class: 'side-section-label' }, '학생 분류'),
      h('button', { class: 'side-add-btn', title: '학생 추가', onClick: () => openStudentForm(null, state.teacher, () => apply()) }, '+')
    ),
    scopeToggle,
    h('div', { class: 'filter-note' }, '선택하지 않으면 모든 학생이 표시됩니다.'),

    // 학교급
    filterBox('학교급 선택', '먼저 학교급을 고르세요.', h('div', {}, levelGroup, gradeWrap), '중·고등학생 전체 표시'),

    // 학교
    filterBox('학교 선택',
      h('div', { class: 'filter-box-actions' },
        miniBtn('추가', () => openSchoolForm(apply)),
        miniBtn('삭제', () => openSchoolDelete(renderSchools)),
        miniBtn('전체 선택', () => { state.filters.school = undefined; renderSchools(); apply(); }),
        miniBtn('선택 해제', () => { state.filters.school = undefined; renderSchools(); apply(); })
      ),
      schoolBox, '선택 없음 · 전체 표시'),

    // 분반
    filterBox('분반 선택',
      h('div', { class: 'filter-box-actions' },
        miniBtn('전체 선택', () => { state.filters.className = undefined; renderClasses(); apply(); }),
        miniBtn('선택 해제', () => { state.filters.className = undefined; renderClasses(); apply(); })
      ),
      classBox, '선택 없음 · 전체 표시'),

    // 검색 + 정렬
    nameInput,
    h('div', { class: 'side-sort-row' }, h('span', { class: 'side-sort-label' }, '정렬'), sortSel),

    // 학생 목록
    listEl,
    h('div', { class: 'ts-divider' }),

    // 내비게이션
    navEl,

    // 규칙 요약
    ruleCard
  ));

  paintList();
  sidebar.__paintList = paintList;
}

// 내비게이션 동작
function handleNav(item, detailPane, navEl) {
  navEl.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === item.key));
  if (item.type === 'ranking') return openRanking(state.teacher);
  if (item.type === 'remote') return openRemote(state.teacher);
  if (item.type === 'backup') return openBackup(state.teacher);
  // section: 해당 섹션 펼치고 스크롤
  const card = detailPane.querySelector(`[data-section="${item.key}"]`);
  if (card) {
    if (card.__expand) card.__expand();
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('nav-flash');
    setTimeout(() => card.classList.remove('nav-flash'), 1200);
  }
}

async function selectStudent(studentId, detailPane, sidebar, App) {
  if (state.selectedStudentId === studentId && detailPane.querySelector('.card')) return;
  state.selectedStudentId = studentId;
  sidebar.querySelectorAll('.student-item').forEach((el) => el.classList.toggle('active', Number(el.dataset.sid) === studentId));

  clear(detailPane);
  detailPane.appendChild(loadingEl('학생 상세 기록을 불러오는 중...'));
  let detail;
  try {
    detail = await App.loadStudentDetail(studentId);
  } catch (err) {
    if (err.kind === 'aborted') return;
    clear(detailPane);
    detailPane.appendChild(errorEl(new Error('상세 기록을 불러오지 못했습니다: ' + err.message), () => selectStudent(studentId, detailPane, sidebar, App)));
    return;
  }
  if (state.selectedStudentId !== studentId) return;
  renderDetail(detailPane, detail, App);
}

function selectStudentKeepActive(detailPane, sidebar, App) {
  if (state.selectedStudentId) {
    state.detailCache.delete(state.selectedStudentId);
    const id = state.selectedStudentId;
    state.selectedStudentId = null;
    selectStudent(id, detailPane, sidebar, App);
  }
}

// ---- 학교 추가/삭제 모달 ----
function openSchoolForm(onDone) {
  import('../ui.js').then(({ openModal, modalShell }) => {
    openModal((close) => {
      const name = h('input', { placeholder: '학교명' });
      const level = segSelect(['etc|기타', 'middle|중학교', 'high|고등학교'], 'etc');
      const save = async () => {
        try { await api.post(`/api/teachers/${state.teacher.id}/schools`, { name: name.value, level: level.value });
          const { schools } = await api.get(`/api/teachers/${state.teacher.id}/schools`); state.schools = schools;
          toast('학교가 추가되었습니다.', 'success'); close(); onDone && onDone(); }
        catch (e) { toast(e.message, 'error'); }
      };
      return modalShell({ title: '학교 추가', close,
        body: h('div', {}, h('div', { class: 'field' }, h('label', {}, '학교명'), name), h('div', { class: 'field' }, h('label', {}, '학교급'), level)),
        footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')] });
    });
  });
}

function openSchoolDelete(onDone) {
  import('../ui.js').then(({ openModal, modalShell, confirmDialog }) => {
    openModal((close) => {
      const box = h('div', {});
      if (!state.schools.length) box.appendChild(h('div', { class: 'empty' }, '등록된 학교가 없습니다.'));
      for (const s of state.schools) {
        box.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #f3ecdf' } },
          h('span', {}, s.name),
          h('button', { class: 'btn sm danger', onClick: async () => {
            const ok = await confirmDialog(`'${s.name}' 학교를 목록에서 삭제할까요?`, { title: '학교 삭제', confirmText: '삭제' });
            if (!ok) return;
            try { await api.del(`/api/schools/${s.id}`); const { schools } = await api.get(`/api/teachers/${state.teacher.id}/schools`); state.schools = schools; toast('삭제되었습니다.', 'success'); close(); onDone && onDone(); }
            catch (e) { toast(e.message, 'error'); }
          } }, '삭제')
        ));
      }
      return modalShell({ title: '학교 삭제', close, body: box, footer: [h('button', { class: 'btn secondary', onClick: close }, '닫기')] });
    });
  });
}

// ---- 작은 UI 헬퍼 ----
function segBtn(label, isActive, onClick) {
  const b = h('button', { class: 'seg-btn' + (isActive() ? ' active' : ''), onClick });
  b.textContent = label;
  b.__sync = () => b.classList.toggle('active', isActive());
  return b;
}
function gradeChip(label, active, onClick) {
  const b = h('button', { class: 'grade-chip-btn' + (active ? ' sel' : ''), onClick }); b.textContent = label; return b;
}
function checkRow(label, active, onClick) {
  return h('label', { class: 'check-row' + (active ? ' checked' : ''), onClick: (e) => { e.preventDefault(); onClick(); } },
    h('span', { class: 'check-box' + (active ? ' on' : '') }, active ? '✓' : ''),
    h('span', { class: 'check-label wrap-anywhere' }, label));
}
function miniBtn(label, onClick) { const b = h('button', { class: 'mini-btn', onClick }); b.textContent = label; return b; }
function filterBox(title, hint, bodyEl, footerNote) {
  return h('div', { class: 'filter-box' },
    h('div', { class: 'filter-box-head' },
      h('span', { class: 'filter-box-title' }, title),
      typeof hint === 'string' ? h('span', { class: 'filter-box-hint' }, hint) : hint),
    bodyEl,
    footerNote ? h('div', { class: 'filter-box-note' }, footerNote) : null);
}
function segSelect(options, current) {
  const s = h('select', { class: 'side-select' });
  for (const opt of options) { const [v, l] = opt.split('|'); const o = h('option', { value: v }, l); if (v === current) o.selected = true; s.appendChild(o); }
  return s;
}

export { SECTION_KEYS };
