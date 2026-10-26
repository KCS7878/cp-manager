// 클라이언트 상태 + localStorage (허용 항목만).
export const LS_KEYS = {
  teacher: 'cp.lastTeacher',
  collapsed: 'cp.collapsed',
  teacherCache: 'cp.teacherCache',
};

export const state = {
  teachers: [],
  teacher: null,       // 선택된 강사 객체
  rules: null,         // 강사 규칙
  students: [],        // 현재 목록
  classes: [],
  schools: [],
  selectedStudentId: null,
  detailCache: new Map(), // studentId -> detail (메모리 캐시)
  filters: { scope: 'mine', sort: 'name' },
};

export function saveLastTeacher(id) {
  try { localStorage.setItem(LS_KEYS.teacher, String(id)); } catch {}
}
export function loadLastTeacher() {
  try { return Number(localStorage.getItem(LS_KEYS.teacher)) || null; } catch { return null; }
}

export function saveTeacherCache(teachers) {
  try { localStorage.setItem(LS_KEYS.teacherCache, JSON.stringify({ at: Date.now(), teachers })); } catch {}
}
export function loadTeacherCache() {
  try {
    const raw = localStorage.getItem(LS_KEYS.teacherCache);
    if (!raw) return null;
    return JSON.parse(raw).teachers;
  } catch { return null; }
}

// 접힘 상태 (섹션별)
export function getCollapsed() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS.collapsed) || '{}'); } catch { return {}; }
}
export function setCollapsed(key, collapsed) {
  const c = getCollapsed();
  c[key] = collapsed;
  try { localStorage.setItem(LS_KEYS.collapsed, JSON.stringify(c)); } catch {}
}
export function setAllCollapsed(keys, collapsed) {
  const c = getCollapsed();
  for (const k of keys) c[k] = collapsed;
  try { localStorage.setItem(LS_KEYS.collapsed, JSON.stringify(c)); } catch {}
}
