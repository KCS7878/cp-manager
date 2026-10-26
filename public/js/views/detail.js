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
  sections.summary = collapsibleSection('summary', '학생 · CP 요약', () => renderSummary(ctx), { icon: '📊', subtitle: '학생 정보, CP 현황과 빠른 통계' });
  sections.ledger = collapsibleSection('ledger', 'CP 지급 내역', () => renderLedger(ctx), { icon: '📒', badge: detail.ledger.length, subtitle: '수동 지급과 자동 지급·차감 기록' });
  sections.coach = collapsibleSection('coach', 'AI 학습 코치', () => renderCoach(ctx), { icon: '🧭', subtitle: '기록 근거, 문제 상황과 다음 수업 행동' });
  sections.lessons = collapsibleSection('lessons', '학습 기록', () => renderLessons(ctx), { icon: '📝', badge: detail.lessons.filter((l) => !l.attendance_only).length, subtitle: '단어 성적, 현재 진도와 최근 수업 기록' });
  sections.attendance = collapsibleSection('attendance', '출결 관리', () => renderAttendance(ctx), { icon: '🗓', subtitle: '지각·결석 기록과 출결 CP' });
  sections.exams = collapsibleSection('exams', '시험 분석', () => renderExams(ctx), { icon: '📈', badge: detail.exams.length, subtitle: '내신·모의고사 성적과 최근 CP 흐름' });
  sections.rules = collapsibleSection('rules', 'CP 규칙 설정', () => renderStudentRules(ctx), { icon: '⚙', subtitle: '학생별·강사별 자동 지급 규칙' });
  sections.guide = collapsibleSection('guide', '의의 및 규칙', () => renderGuideSection(ctx), { icon: '📜', subtitle: '학생 공유용 CP 운영 안내문' });
  sections.shop = collapsibleSection('shop', '상점 · 인벤토리', () => renderShop(ctx), { icon: '🛒', subtitle: '상품, 구매내역과 사용 기록' });

  for (const k of SECTION_KEYS) {
    sections[k].setAttribute('data-section', k);
    pane.appendChild(sections[k]);
  }
}

function expandAll(sections, expand) {
  for (const k of Object.keys(sections)) {
    if (expand) sections[k].__expand();
    else sections[k].__collapse();
  }
  setAllCollapsed(Object.keys(sections), !expand);
}
