import { h, clear, toast, loadingEl, errorEl, openModal, modalShell, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { state, setAllCollapsed } from '../state.js';
import { renderDetail } from './detail.js';
import { openStudentForm } from './student-form.js';
import { openRulesModal } from './rules.js';
import { openGuideModal } from './guide.js';

const SECTION_KEYS = [
  'summary', 'ledger', 'coach', 'lessons', 'attendance', 'exams', 'rules', 'guide', 'shop',
];

export function renderWorkspace(root, App) {
  clear(root);

  const grid = h('div', { class: 'main-grid' });
  const sidebar = h('div', {});
  const detailPane = h('div', {});
  grid.appendChild(sidebar);
  grid.appendChild(detailPane);
  root.appendChild(grid);

  renderSidebar(sidebar, detailPane, App);

  // 첫 학생 자동 선택 (별도 로드)
  if (state.students.length) {
    selectStudent(state.students[0].id, detailPane, sidebar, App);
  } else {
    detailPane.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-body empty' }, '담당 학생이 없습니다. 좌측에서 “학생 추가”를 눌러 시작하세요.')
    ));
  }
}

function renderSidebar(sidebar, detailPane, App) {
  clear(sidebar);
  const t = state.teacher;

  const listEl = h('div', { class: 'student-list' });

  // 필터 UI
  const scopeSel = sel(['mine|담당 학생', 'all|전체 학생'], state.filters.scope);
  const sortSel = sel(['name|이름순', 'cp_desc|CP 많은순', 'cp_asc|CP 적은순'], state.filters.sort);
  const levelSel = sel(['|학교급 전체', 'middle|중학생', 'high|고등학생'], state.filters.level || '');
  const gradeWrap = h('div', {});
  const classSel = sel(['|분반 전체', ...state.classes.map((c) => `${c}|${c}`)], state.filters.className || '');
  const schoolSel = sel(['|학교 전체', ...state.schools.map((s) => `${s.name}|${s.name}`)], state.filters.school || '');
  const nameInput = h('input', { placeholder: '이름 검색', value: state.filters.name || '' });

  function renderGradeStep() {
    clear(gradeWrap);
    const lv = state.filters.level;
    if (lv !== 'middle' && lv !== 'high') return;
    const grades = lv === 'middle' ? ['중1', '중2', '중3'] : ['고1', '고2', '고3'];
    const step = h('div', { class: 'grade-step' });
    step.appendChild(h('button', { class: !state.filters.grade ? 'sel' : '', onClick: () => { state.filters.grade = ''; apply(); } }, '전체'));
    for (const g of grades) {
      step.appendChild(h('button', { class: state.filters.grade === g ? 'sel' : '',
        onClick: () => { state.filters.grade = g; apply(); } }, g));
    }
    gradeWrap.appendChild(step);
  }

  const apply = async () => {
    state.filters.scope = scopeSel.value;
    state.filters.sort = sortSel.value;
    state.filters.level = levelSel.value || undefined;
    state.filters.className = classSel.value || undefined;
    state.filters.school = schoolSel.value || undefined;
    state.filters.name = nameInput.value || undefined;
    if (levelSel.value !== 'middle' && levelSel.value !== 'high') state.filters.grade = '';
    renderGradeStep();
    listEl.innerHTML = '';
    listEl.appendChild(loadingEl('목록 갱신 중...'));
    await App.refreshStudents();
    paintList();
  };

  [scopeSel, sortSel, levelSel, classSel, schoolSel].forEach((s) => (s.onchange = apply));
  let nameTimer;
  nameInput.oninput = () => { clearTimeout(nameTimer); nameTimer = setTimeout(apply, 300); };

  function paintList() {
    clear(listEl);
    if (!state.students.length) {
      listEl.appendChild(h('div', { class: 'empty' }, '조건에 맞는 학생이 없습니다.'));
      return;
    }
    for (const s of state.students) {
      const item = h('div', {
        class: 'student-item' + (s.id === state.selectedStudentId ? ' active' : ''),
        tabindex: '0', role: 'button', dataset: { sid: s.id },
        onClick: () => selectStudent(s.id, detailPane, sidebar, App),
        onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectStudent(s.id, detailPane, sidebar, App); } },
      },
        h('div', { class: 's-name wrap-anywhere' }, s.name),
        h('div', { class: 's-meta wrap-anywhere' }, [s.grade, s.school, s.class_name].filter(Boolean).join(' · ') || '정보 없음'),
        h('div', { class: 's-cp' },
          h('span', { class: 'cp-chip avail' }, `사용가능 ${s.available_cp}`),
          h('span', { class: 'cp-chip pending' }, `대기 ${s.pending_cp}`)
        )
      );
      listEl.appendChild(item);
    }
  }

  renderGradeStep();

  const card = h('div', { class: 'card' },
    h('div', { class: 'section-head', style: { cursor: 'default' } },
      h('h2', {}, `학생 (${state.teacher.name})`),
    ),
    h('div', { class: 'section-body' },
      h('div', { class: 'btn-row', style: { marginBottom: '0.6rem' } },
        h('button', { class: 'btn sm', onClick: () => openStudentForm(null, state.teacher, () => apply()) }, '+ 학생 추가'),
        h('button', { class: 'btn sm secondary', onClick: () => openRulesModal(state.teacher, state.rules, (r) => { state.rules = r; }) }, '⚙ 강사 규칙'),
        h('button', { class: 'btn sm secondary', onClick: () => openGuideModal(state.teacher) }, '📜 의의·규칙'),
      ),
      h('div', { class: 'filters' }, scopeSel, sortSel, levelSel, schoolSel, classSel, nameInput),
      gradeWrap,
      listEl
    )
  );
  sidebar.appendChild(card);
  paintList();

  sidebar.__paintList = paintList;
}

async function selectStudent(studentId, detailPane, sidebar, App) {
  if (state.selectedStudentId === studentId && detailPane.querySelector('.card')) return;
  state.selectedStudentId = studentId;

  // 사이드바 active 갱신
  sidebar.querySelectorAll('.student-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.sid) === studentId);
  });

  clear(detailPane);
  detailPane.appendChild(loadingEl('학생 상세 기록을 불러오는 중...'));

  let detail;
  try {
    detail = await App.loadStudentDetail(studentId);
  } catch (err) {
    if (err.kind === 'aborted') return; // 다른 학생으로 전환됨
    clear(detailPane);
    detailPane.appendChild(errorEl(new Error('상세 기록을 불러오지 못했습니다: ' + err.message),
      () => selectStudent(studentId, detailPane, sidebar, App)));
    return;
  }
  if (state.selectedStudentId !== studentId) return; // 전환됨

  document.addEventListener('cp:students-updated', () => {
    sidebar.__paintList && sidebar.__paintList();
  });

  renderDetail(detailPane, detail, App);
}

// 유틸: "value|label" 배열로 select 생성
function sel(options, current) {
  const s = h('select');
  for (const opt of options) {
    const [value, label] = opt.split('|');
    const o = h('option', { value }, label);
    if (value === current) o.selected = true;
    s.appendChild(o);
  }
  return s;
}

export { SECTION_KEYS };
