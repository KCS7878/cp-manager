import { api, ApiError } from './api.js';
import { h, clear, toast, errorEl, loadingEl } from './ui.js';
import {
  state, saveLastTeacher, loadLastTeacher, saveTeacherCache, loadTeacherCache,
} from './state.js';
import { renderTeacherSelect } from './views/teacher-select.js';
import { renderWorkspace } from './views/workspace.js';
import { openWordWidget } from './views/word-widget.js';
import { openRemote } from './views/remote.js';
import { openRanking } from './views/ranking.js';
import { openBackup } from './views/backup.js';
import { renderEntry } from './views/entry.js';
import { renderStudentView } from './views/student-view.js';
import { renderAdminView } from './views/admin-view.js';

const appEl = document.getElementById('app');
const headerEl = document.querySelector('.app-header');

export const App = {
  async boot() {
    this.bindHeader();
    this.showEntry();
  },

  // 시작 화면 (역할 선택 + 코드 입력)
  showEntry() {
    this.setHeaderMode('entry');
    renderEntry(appEl, {
      onTeacher: (teacher) => this.enterTeacherModeWith(teacher),
      onStudent: (studentId) => this.enterStudentMode(studentId),
      onAdmin: () => this.enterAdminMode(),
      onNewTeacher: () => this.createFirstTeacher(),
    });
  },

  // 총관리자 모드
  enterAdminMode() {
    this.setHeaderMode('admin');
    const badge = document.getElementById('teacherBadge');
    if (badge) { badge.className = 'teacher-badge'; badge.textContent = '🛡 총관리자'; }
    renderAdminView(appEl, {
      onEnterTeacher: (t) => this.enterTeacherModeWith(t),
      onExit: () => this.exitToEntry(),
    });
  },

  // "새 강사 만들기" (빈 상태에서 첫 강사 생성)
  async createFirstTeacher() {
    const { h, openModal, modalShell, toast } = await import('./ui.js');
    openModal((close) => {
      const name = h('input', { placeholder: '강사 이름 (예: 김영어)' });
      const color = h('input', { type: 'color', value: '#ee735a' });
      const save = async () => {
        if (!name.value.trim()) { toast('강사 이름을 입력하세요.', 'error'); return; }
        try {
          const { teacher } = await api.post('/api/teachers', { name: name.value, color: color.value });
          toast('강사가 생성되었습니다! 바로 관리 화면으로 들어갑니다.', 'success');
          close();
          this.enterTeacherModeWith(teacher);
        } catch (e) { toast(e.message, 'error'); }
      };
      return modalShell({
        title: '새 강사 만들기', close,
        body: h('div', {},
          h('p', { class: 'muted' }, '처음 시작하시는군요! 강사(선생님) 이름을 입력하면 바로 관리 화면으로 들어갑니다. 접속 코드는 자동 발급됩니다.'),
          h('div', { class: 'field' }, h('label', {}, '강사 이름'), name),
          h('div', { class: 'field' }, h('label', {}, '카드 색상'), color),
        ),
        footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '만들고 시작')],
      });
    });
  },

  // 선생님 모드: 특정 강사로 바로 진입 (코드/관리자 선택 기준)
  async enterTeacherModeWith(teacher) {
    this.setHeaderMode('teacher');
    // 전체 강사 목록도 로드해두되(학교/분반 필터용), 선택은 이 강사로 고정
    try {
      const { teachers } = await api.get('/api/teachers', { timeout: 12000 });
      state.teachers = teachers;
      saveTeacherCache(teachers);
    } catch { /* 목록 실패해도 선택 강사로 진행 */ }
    const full = (state.teachers || []).find((t) => t.id === teacher.id) || teacher;
    await this.selectTeacher(full);
  },

  // 학생 모드: 읽기 전용 화면
  async enterStudentMode(studentId) {
    this.setHeaderMode('student');
    renderStudentView(appEl, studentId, { onExit: () => this.exitToEntry() });
  },

  exitToEntry() {
    try { localStorage.removeItem('cp.lastCode'); } catch {}
    state.teacher = null;
    window.__cpTeacher = null;
    this.showEntry();
  },

  // 헤더 버튼 노출 제어 (entry/student 모드에선 관리 버튼 숨김)
  setHeaderMode(mode) {
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
    const isTeacher = mode === 'teacher';
    show('btnWordWidget', isTeacher);
    show('btnRemote', isTeacher);
    show('btnRanking', isTeacher);
    show('btnBackup', isTeacher);
    // 강사 변경/나가기 버튼
    const changeBtn = document.getElementById('btnChangeTeacher');
    if (changeBtn) {
      if (isTeacher) { changeBtn.style.display = ''; changeBtn.textContent = '↩ 나가기'; }
      else changeBtn.style.display = 'none';
    }
    if (mode !== 'teacher') {
      const badge = document.getElementById('teacherBadge');
      if (badge) badge.textContent = '';
    }
  },

  bindHeader() {
    // 팝업(단어 위젯/리모콘)에서 데이터 변경 시 메인 반영
    document.addEventListener('cp:data-changed', async (e) => {
      const sid = e.detail && e.detail.studentId;
      if (sid) this.invalidateStudent(sid);
      await this.refreshStudents();
      document.dispatchEvent(new CustomEvent('cp:students-updated'));
      // 현재 보고 있는 학생이면 상세도 새로고침
      if (sid && sid === state.selectedStudentId) {
        const pane = document.querySelector('.main-grid > div:last-child');
        if (pane) {
          const fresh = await this.loadStudentDetail(sid, { force: true });
          const { renderDetail } = await import('./views/detail.js');
          renderDetail(pane, fresh, this);
        }
      }
    });

    document.getElementById('btnWordWidget').onclick = () => openWordWidget();
    document.getElementById('btnRemote').onclick = () => {
      if (!state.teacher) return toast('먼저 강사를 선택하세요.', 'error');
      openRemote(state.teacher);
    };
    document.getElementById('btnRanking').onclick = () => {
      if (!state.teacher) return toast('먼저 강사를 선택하세요.', 'error');
      openRanking(state.teacher);
    };
    document.getElementById('btnBackup').onclick = () => openBackup(state.teacher);
    document.getElementById('btnChangeTeacher').onclick = () => this.exitToEntry();
  },

  // 1단계: 강사 목록만 빠르게 로드
  async loadTeachers() {
    appEl.innerHTML = '';
    appEl.appendChild(loadingEl('강사 목록을 불러오는 중...'));

    // 읽기 전용 캐시 먼저 표시 (빈 화면 방지)
    const cached = loadTeacherCache();
    if (cached && cached.length) state.teachers = cached;

    try {
      const { teachers } = await api.get('/api/teachers', { timeout: 12000 });
      state.teachers = teachers;
      saveTeacherCache(teachers);
    } catch (err) {
      // 실패를 "강사 없음"으로 처리하지 않는다. 명확한 오류 + 다시 시도.
      clear(appEl);
      appEl.appendChild(
        errorEl(
          new Error(
            `강사 목록을 불러오지 못했습니다: ${err.message}\n` +
            (cached && cached.length ? '(아래는 이전에 저장된 캐시 목록이며 최신이 아닐 수 있습니다.)' : '기존 데이터가 사라진 것이 아닙니다. 다시 시도해 주세요.')
          ),
          () => this.loadTeachers()
        )
      );
      if (cached && cached.length) {
        appEl.appendChild(renderTeacherSelect(state.teachers, (t) => this.selectTeacher(t), { stale: true }));
      }
      return;
    }

    // 마지막 선택 강사가 있으면 자동 진입
    const last = loadLastTeacher();
    const lastTeacher = last ? state.teachers.find((t) => t.id === last) : null;
    if (lastTeacher) {
      await this.selectTeacher(lastTeacher);
    } else {
      this.showTeacherSelect();
    }
  },

  showTeacherSelect() {
    state.teacher = null;
    document.getElementById('teacherBadge').textContent = '';
    clear(appEl);
    appEl.appendChild(renderTeacherSelect(state.teachers, (t) => this.selectTeacher(t), {
      onChanged: () => this.loadTeachers(),
    }));
  },

  // 2~3단계: 강사 선택 -> 학생/규칙 로드
  async selectTeacher(teacher) {
    state.teacher = teacher;
    window.__cpTeacher = teacher;
    state.selectedStudentId = null;
    state.detailCache.clear();
    saveLastTeacher(teacher.id);

    const badge = document.getElementById('teacherBadge');
    badge.className = 'teacher-badge';
    badge.innerHTML = `<span style="width:12px;height:12px;border-radius:50%;background:${teacher.color};display:inline-block"></span> ${teacher.name} 선생님`;
    document.getElementById('btnChangeTeacher').style.display = '';

    clear(appEl);
    appEl.appendChild(loadingEl(`${teacher.name} 선생님의 학생을 불러오는 중...`));

    try {
      const [rulesRes, studentsRes, classesRes, schoolsRes] = await Promise.all([
        api.get(`/api/teachers/${teacher.id}/rules`),
        api.get('/api/students', { query: { teacher_id: teacher.id, scope: 'mine', sort: state.filters.sort } }),
        api.get(`/api/teachers/${teacher.id}/classes`),
        api.get(`/api/teachers/${teacher.id}/schools`),
      ]);
      state.rules = rulesRes.rules;
      state.students = studentsRes.students;
      state.classes = classesRes.classes;
      state.schools = schoolsRes.schools;
    } catch (err) {
      clear(appEl);
      appEl.appendChild(errorEl(new Error(`학생 정보를 불러오지 못했습니다: ${err.message}`), () => this.selectTeacher(teacher)));
      return;
    }

    renderWorkspace(appEl, App);
  },

  // 학생 목록 새로고침 (필터 반영)
  async refreshStudents() {
    const { filters, teacher } = state;
    try {
      // 코드 기반 로그인 → 항상 해당 강사(mine). 학교는 다중 선택이므로 서버 단일필터 대신 클라에서 처리.
      const { students } = await api.get('/api/students', {
        query: {
          teacher_id: teacher.id,
          scope: 'mine',
          class_name: filters.className,
          level: filters.level,
          grade: filters.grade,
          name: filters.name,
          sort: filters.sort,
        },
        dedupKey: 'students-list',
      });
      state.allStudents = students; // 학교 옵션 산출용 (필터 전 전체)
      // 학교 다중 선택 필터 (빈 배열/undefined면 전체)
      const sel = filters.schools;
      state.students = (sel && sel.length)
        ? students.filter((s) => sel.includes(s.school))
        : students;
      return state.students;
    } catch (err) {
      toast('학생 목록 갱신 실패: ' + err.message, 'error');
      return state.students;
    }
  },

  // 학생 상세 로드 (캐시 + 이전 요청 취소)
  async loadStudentDetail(studentId, { force = false } = {}) {
    if (!force && state.detailCache.has(studentId)) {
      return state.detailCache.get(studentId);
    }
    const detail = await api.get(`/api/students/${studentId}/detail`, {
      signalOwnerKey: 'student-detail', // 이전 학생 상세 요청 취소
      timeout: 12000,
    });
    state.detailCache.set(studentId, detail);
    return detail;
  },

  invalidateStudent(studentId) {
    state.detailCache.delete(studentId);
  },
};

App.boot();
