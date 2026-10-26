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

export function openLessonForm(ctx, lesson) {
  const student = ctx.student;
  const isCount = student.word_input_mode === 'count';

  openModal((close) => {
    const field = (label, el, hint) => h('div', { class: 'field' }, h('label', {}, label), el, hint ? h('div', { class: 'hint', style: { marginTop: '0.3rem' } }, hint) : null);
    const f = {};
    f.lesson_date = h('input', { type: 'date', value: lesson?.lesson_date || today() });
    f.attendance = selEl(['present|출석', 'late|지각', 'absent|결석'], lesson?.attendance || 'present');
    f.late_minutes = h('input', { type: 'number', min: '0', value: lesson?.late_minutes || 0 });
    f.word_status = selEl(['none|시험 없음', 'taken|응시', 'noshow|미응시', 'etc|기타'], lesson?.word_status || 'none');
    f.word_etc_reason = h('input', { value: lesson?.word_etc_reason || '', placeholder: '기타 사유 (필수)' });
    f.word_range = h('input', { value: lesson?.word_range || '', placeholder: '예: Day 20~21, 중간고사 범위 1차' });
    f.word_seen = h('input', { type: 'number', min: '0', value: lesson?.word_seen ?? '' });
    f.word_wrong = h('input', { type: 'number', min: '0', value: lesson?.word_wrong ?? '' });
    f.word_score = h('input', { type: 'number', min: '0', max: '100', value: lesson?.word_score ?? '' });
    f.deadline_met = selEl(['1|기한 내 준수', '0|기한 초과'], String(lesson?.deadline_met ?? 1));
    f.progress_today = h('textarea', {}, lesson?.progress_today || '');
    f.next_direction = h('textarea', {}, lesson?.next_direction || '');
    f.weakness = h('textarea', {}, lesson?.weakness || '');
    f.homework = h('textarea', {}, lesson?.homework || '');
    f.progress_rate = h('input', { type: 'number', min: '0', max: '100', value: lesson?.progress_rate ?? '' });

    const lateWrap = field('지각 시간(분)', f.late_minutes);
    const etcWrap = field('기타 사유', f.word_etc_reason, '첫 수업, 시험 범위 미지정 등. CP는 변동하지 않습니다.');
    const scoreBox = h('div', { class: 'form-grid' });
    const rangeWrap = field('단어시험 범위 (자유 입력)', f.word_range);
    const deadlineWrap = field('마감 기한', f.deadline_met);

    function refreshVisibility() {
      lateWrap.style.display = f.attendance.value === 'late' ? '' : 'none';
      const ws = f.word_status.value;
      etcWrap.style.display = ws === 'etc' ? '' : 'none';
      const showWord = ws === 'taken';
      scoreBox.style.display = showWord ? '' : 'none';
      rangeWrap.style.display = ws === 'none' ? 'none' : '';
      deadlineWrap.style.display = showWord ? '' : 'none';
    }
    f.attendance.onchange = refreshVisibility;
    f.word_status.onchange = refreshVisibility;

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
        attendance: f.attendance.value,
        late_minutes: Number(f.late_minutes.value) || 0,
        word_status: f.word_status.value,
        word_etc_reason: f.word_etc_reason.value,
        word_range: f.word_range.value,
        deadline_met: Number(f.deadline_met.value),
        progress_today: f.progress_today.value,
        next_direction: f.next_direction.value,
        weakness: f.weakness.value,
        homework: f.homework.value,
        progress_rate: f.progress_rate.value ? Number(f.progress_rate.value) : null,
      };
      if (f.word_status.value === 'taken') {
        if (isCount) {
          body.word_seen = f.word_seen.value ? Number(f.word_seen.value) : null;
          body.word_wrong = f.word_wrong.value ? Number(f.word_wrong.value) : 0;
        } else {
          body.word_seen = f.word_seen.value ? Number(f.word_seen.value) : null;
          body.word_score = f.word_score.value !== '' ? Number(f.word_score.value) : null;
        }
      }
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
      title: lesson ? '수업 기록 수정' : '수업 기록 추가', close,
      body: h('div', {},
        h('div', { class: 'hint', style: { marginBottom: '0.6rem' } }, `단어 입력 방식: ${isCount ? '개수제 (틀린 개수로 자동 환산)' : '점수제'}`),
        h('div', { class: 'form-grid' }, field('수업일 *', f.lesson_date), field('출결', f.attendance)),
        lateWrap,
        h('div', { class: 'form-grid' }, field('단어시험 상태', f.word_status)),
        etcWrap, rangeWrap, scoreBox, deadlineWrap,
        field('진도율(%)', f.progress_rate),
        field('이번 수업 진도', f.progress_today),
        field('다음 수업 방향', f.next_direction),
        field('확인된 약점', f.weakness),
        field('숙제', f.homework),
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
