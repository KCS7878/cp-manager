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

const appEl = document.getElementById('app');

export const App = {
  async boot() {
    this.bindHeader();
    await this.loadTeachers();
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
    document.getElementById('btnChangeTeacher').onclick = () => this.showTeacherSelect();
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
    document.getElementById('btnChangeTeacher').style.display = 'none';
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
      const { students } = await api.get('/api/students', {
        query: {
          teacher_id: teacher.id,
          scope: filters.scope,
          school: filters.school,
          class_name: filters.className,
          level: filters.level,
          grade: filters.grade,
          name: filters.name,
          sort: filters.sort,
        },
        dedupKey: 'students-list',
      });
      state.students = students;
      return students;
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
