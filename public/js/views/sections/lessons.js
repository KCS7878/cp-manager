import { h, openModal, modalShell, toast, confirmDialog } from '../../ui.js';
import { api } from '../../api.js';

const WORD_STATUS_LABEL = { none: '시험 없음', taken: '응시', noshow: '미응시', etc: '기타' };
const ATT_LABEL = { present: '출석', late: '지각', absent: '결석' };

export function renderLessons(ctx) {
  const lessons = ctx.detail.lessons.filter((l) => !l.attendance_only);
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.6rem' } },
    h('button', { class: 'btn sm', onClick: () => openLessonForm(ctx, null) }, '+ 수업 기록 추가')
  ));

  if (!lessons.length) {
    wrap.appendChild(h('div', { class: 'empty' }, '수업 기록이 없습니다.'));
    return wrap;
  }

  const rows = lessons.map((l) =>
    h('tr', {},
      h('td', {}, l.lesson_date),
      h('td', {}, h('span', { class: 'pill ' + l.attendance }, ATT_LABEL[l.attendance] + (l.attendance === 'late' && l.late_minutes ? ` ${l.late_minutes}분` : ''))),
      h('td', {}, h('span', { class: 'pill ' + l.word_status }, WORD_STATUS_LABEL[l.word_status])),
      h('td', { class: 'wrap-anywhere' }, l.word_range || '-'),
      h('td', {}, l.word_status === 'taken' ? `${l.word_score}점${l.deadline_met ? '' : ' (기한초과)'}` : '-'),
      h('td', { class: 'wrap-anywhere' }, l.progress_today || '-'),
      h('td', {},
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn sm secondary', onClick: () => openLessonForm(ctx, l) }, '수정'),
          h('button', { class: 'btn sm danger', onClick: () => delLesson(ctx, l) }, '삭제'),
        )
      )
    )
  );

  wrap.appendChild(h('div', { class: 'table-scroll' },
    h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', {}, '수업일'), h('th', {}, '출결'), h('th', {}, '단어시험'),
        h('th', {}, '범위'), h('th', {}, '점수'), h('th', {}, '진도'), h('th', {}, ''))),
      h('tbody', {}, ...rows)
    )
  ));
  return wrap;
}

export function openLessonForm(ctx, lesson, opts = {}) {
  const student = ctx.student;
  const isCount = student.word_input_mode === 'count';
  // 모드 판별: 빠른진입 focus='word' 이거나, 기존 기록이 단어시험 응시 기록이면 단어시험 모드
  const isWordMode = opts.focus === 'word' || (lesson && lesson.word_status === 'taken');

  if (isWordMode) return openWordExamForm(ctx, lesson, { isCount });
  return openClassRecordForm(ctx, lesson, { isCount });
}

// ─────────────────────────────────────────────────────────────
// 수업 기록 폼: 단어시험 상태 없음, 진도/방향 통합
// ─────────────────────────────────────────────────────────────
function openClassRecordForm(ctx, lesson, { isCount }) {
  const student = ctx.student;

  openModal((close) => {
    const field = (label, el, hint) => h('div', { class: 'field' }, h('label', {}, label), el, hint ? h('div', { class: 'hint', style: { marginTop: '0.3rem' } }, hint) : null);
    const f = {};
    f.lesson_date = h('input', { type: 'date', value: lesson?.lesson_date || today() });
    f.attendance = selEl(['present|출석', 'late|지각', 'absent|결석'], lesson?.attendance || 'present');
    f.late_minutes = h('input', { type: 'number', min: '0', value: lesson?.late_minutes || 0 });
    // 기존 데이터 호환: progress_today + next_direction 이 따로 저장돼 있으면 합쳐서 표시
    const mergedProgress = [lesson?.progress_today, lesson?.next_direction].filter((v) => v && v.trim()).join('\n');
    f.progress_today = h('textarea', {}, mergedProgress);
    f.weakness = h('textarea', {}, lesson?.weakness || '');
    f.homework = h('textarea', {}, lesson?.homework || '');
    f.progress_rate = h('input', { type: 'number', min: '0', max: '100', value: lesson?.progress_rate ?? '' });

    const lateWrap = field('지각 시간(분)', f.late_minutes);
    function refreshVisibility() {
      lateWrap.style.display = f.attendance.value === 'late' ? '' : 'none';
    }
    f.attendance.onchange = refreshVisibility;

    const save = async () => {
      const body = {
        lesson_date: f.lesson_date.value,
        attendance: f.attendance.value,
        late_minutes: Number(f.late_minutes.value) || 0,
        // 응시(taken)가 아닌 기존 단어상태(none/noshow/etc)는 보존, 신규는 none
        word_status: lesson ? (lesson.word_status === 'taken' ? 'none' : lesson.word_status) : 'none',
        progress_today: f.progress_today.value,
        next_direction: '', // 통합 필드로 대체 — 별도 다음 수업 방향은 사용하지 않음
        weakness: f.weakness.value,
        homework: f.homework.value,
        progress_rate: f.progress_rate.value ? Number(f.progress_rate.value) : null,
      };
      try {
        if (lesson) await api.put(`/api/lessons/${lesson.id}`, body);
        else await api.post(`/api/students/${student.id}/lessons`, body);
        toast('저장되었습니다. CP가 재계산되었습니다.', 'success');
        close();
        ctx.reload();
      } catch (e) { toast(e.message, 'error'); }
    };

    setTimeout(refreshVisibility, 0);

    return modalShell({
      title: lesson ? '수업 기록 수정' : '📖 수업 기록 추가', close,
      body: h('div', {},
        h('div', { class: 'form-grid' }, field('수업일 *', f.lesson_date), field('출결', f.attendance)),
        lateWrap,
        field('진도율(%)', f.progress_rate),
        field('이번 수업 진도 및 다음 수업 방향', f.progress_today),
        field('확인된 약점', f.weakness),
        field('숙제', f.homework),
      ),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')],
    });
  });
}

// ─────────────────────────────────────────────────────────────
// 단어시험 폼: 응시 전제, 수업 관련 필드 없음
// ─────────────────────────────────────────────────────────────
function openWordExamForm(ctx, lesson, { isCount }) {
  const student = ctx.student;

  openModal((close) => {
    const field = (label, el, hint) => h('div', { class: 'field' }, h('label', {}, label), el, hint ? h('div', { class: 'hint', style: { marginTop: '0.3rem' } }, hint) : null);
    const f = {};
    f.lesson_date = h('input', { type: 'date', value: lesson?.lesson_date || today() });
    f.word_range = h('input', { value: lesson?.word_range || '', placeholder: '예: Day 20~21, 중간고사 범위 1차' });
    f.word_seen = h('input', { type: 'number', min: '0', value: lesson?.word_seen ?? '' });
    f.word_wrong = h('input', { type: 'number', min: '0', value: lesson?.word_wrong ?? '' });
    f.word_score = h('input', { type: 'number', min: '0', max: '100', value: lesson?.word_score ?? '' });
    f.deadline_met = selEl(['1|기한 내 준수', '0|기한 초과'], String(lesson?.deadline_met ?? 1));
    f.weakness = h('textarea', {}, lesson?.weakness || '');

    const scoreBox = h('div', { class: 'form-grid' });
    if (isCount) {
      scoreBox.appendChild(field('본 단어 수', f.word_seen));
      scoreBox.appendChild(field('틀린 단어 수', f.word_wrong));
    } else {
      scoreBox.appendChild(field('본 단어 수', f.word_seen));
      scoreBox.appendChild(field('점수 (0~100)', f.word_score));
    }

    const save = async () => {
      const body = {
        lesson_date: f.lesson_date.value,
        word_status: 'taken',
        word_range: f.word_range.value,
        deadline_met: Number(f.deadline_met.value),
        weakness: f.weakness.value,
      };
      if (isCount) {
        body.word_seen = f.word_seen.value ? Number(f.word_seen.value) : null;
        body.word_wrong = f.word_wrong.value ? Number(f.word_wrong.value) : 0;
      } else {
        body.word_seen = f.word_seen.value ? Number(f.word_seen.value) : null;
        body.word_score = f.word_score.value !== '' ? Number(f.word_score.value) : null;
      }
      try {
        if (lesson) await api.put(`/api/lessons/${lesson.id}`, body);
        else await api.post(`/api/students/${student.id}/lessons`, body);
        toast('저장되었습니다. CP가 재계산되었습니다.', 'success');
        close();
        ctx.reload();
      } catch (e) { toast(e.message, 'error'); }
    };

    return modalShell({
      title: lesson ? '단어시험 기록 수정' : '✏️ 단어시험 입력', close,
      body: h('div', {},
        h('div', { class: 'hint', style: { marginBottom: '0.6rem' } }, `단어 입력 방식: ${isCount ? '개수제 (틀린 개수로 자동 환산)' : '점수제'}`),
        h('div', { class: 'form-grid' }, field('단어시험 응시일 *', f.lesson_date)),
        field('단어시험 범위 (자유 입력)', f.word_range),
        scoreBox,
        field('마감 기한', f.deadline_met),
        field('틀린 단어', f.weakness),
      ),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')],
    });
  });
}

async function delLesson(ctx, l) {
  const ok = await confirmDialog(`${l.lesson_date} 수업 기록을 삭제하시겠습니까?`, { title: '수업 기록 삭제', confirmText: '삭제', detail: '연결된 CP 효과도 함께 되돌려집니다.' });
  if (!ok) return;
  try {
    await api.del(`/api/lessons/${l.id}`);
    toast('삭제되었습니다.', 'success');
    ctx.reload();
  } catch (e) { toast(e.message, 'error'); }
}

function today() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function selEl(options, current) {
  const s = h('select');
  for (const opt of options) { const [v, l] = opt.split('|'); const o = h('option', { value: v }, l); if (v === current) o.selected = true; s.appendChild(o); }
  return s;
}
