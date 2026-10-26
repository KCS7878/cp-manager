import { h, clear, toast } from '../ui.js';
import { api } from '../api.js';
import { state, setAllCollapsed } from '../state.js';
import { collapsibleSection } from './section.js';
import { SECTION_KEYS } from './workspace.js';
import { renderSummary } from './sections/summary.js';
import { renderLedger } from './sections/ledger.js';
import { renderCoach } from './sections/coach.js';
import { renderLessons } from './sections/lessons.js';
import { renderAttendance } from './sections/attendance.js';
import { renderExams } from './sections/exams.js';
import { renderStudentRules } from './sections/student-rules.js';
import { renderGuideSection } from './sections/guide-section.js';
import { renderShop } from './sections/shop.js';

/**
 * 학생 상세 전체 렌더. reload()는 최신 데이터로 이 함수를 다시 호출.
 */
export function renderDetail(pane, detail, App) {
  clear(pane);

  const reload = async () => {
    App.invalidateStudent(detail.student.id);
    const fresh = await App.loadStudentDetail(detail.student.id, { force: true });
    // 목록의 CP도 갱신
    await App.refreshStudents();
    const sidebar = document.querySelector('.main-grid > div:first-child');
    renderDetail(pane, fresh, App);
    // 사이드바 재칠
    const evt = new CustomEvent('cp:students-updated');
    document.dispatchEvent(evt);
  };

  const ctx = { student: detail.student, detail, App, reload };

  // 상단 도구바
  const toolbar = h('div', { class: 'toolbar' },
    h('div', {},
      h('strong', { style: { fontSize: '1.2rem' } }, detail.student.name),
      h('span', { class: 'muted', style: { marginLeft: '0.5rem' } },
        [detail.student.grade, detail.student.school, detail.student.class_name].filter(Boolean).join(' · '))
    ),
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn sm secondary', onClick: () => expandAll(sections, true) }, '전체 펼치기'),
    h('button', { class: 'btn sm secondary', onClick: () => expandAll(sections, false) }, '전체 접기'),
  );
  pane.appendChild(toolbar);

  const sections = {};
  sections.summary = collapsibleSection('summary', '📊 학생 · CP 요약', () => renderSummary(ctx));
  sections.ledger = collapsibleSection('ledger', '📒 CP 지급 내역', () => renderLedger(ctx), { badge: detail.ledger.length });
  sections.coach = collapsibleSection('coach', '🧭 AI 학습 코치', () => renderCoach(ctx));
  sections.lessons = collapsibleSection('lessons', '📝 학습 기록 (수업)', () => renderLessons(ctx), { badge: detail.lessons.filter((l) => !l.attendance_only).length });
  sections.attendance = collapsibleSection('attendance', '🗓 출결 관리', () => renderAttendance(ctx));
  sections.exams = collapsibleSection('exams', '📈 시험 분석 (내신·모의)', () => renderExams(ctx), { badge: detail.exams.length });
  sections.rules = collapsibleSection('rules', '⚙ CP 규칙 설정 (학생 예외)', () => renderStudentRules(ctx));
  sections.guide = collapsibleSection('guide', '📜 의의 및 규칙', () => renderGuideSection(ctx));
  sections.shop = collapsibleSection('shop', '🛒 상점 · 인벤토리', () => renderShop(ctx));

  for (const k of SECTION_KEYS) pane.appendChild(sections[k]);
}

function expandAll(sections, expand) {
  for (const k of Object.keys(sections)) {
    if (expand) sections[k].__expand();
    else sections[k].__collapse();
  }
  setAllCollapsed(Object.keys(sections), !expand);
}
