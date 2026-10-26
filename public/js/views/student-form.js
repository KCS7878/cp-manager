import { h, openModal, modalShell, toast } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';

export function openStudentForm(student, teacher, onSaved) {
  teacher = teacher || state.teacher;
  openModal((close) => {
    const f = {};
    const field = (label, el) => h('div', { class: 'field' }, h('label', {}, label), el);

    f.name = h('input', { value: student?.name || '' });
    f.school = h('input', { value: student?.school || '', list: 'schoolList' });
    f.school_level = selEl(['etc|기타', 'middle|중학생', 'high|고등학생'], student?.school_level || 'etc');
    f.grade = h('input', { value: student?.grade || '', placeholder: '예: 고2' });
    f.class_name = h('input', { value: student?.class_name || '' });
    f.age = h('input', { type: 'number', value: student?.age || '' });
    f.subject = h('input', { value: student?.subject || '영어' });
    f.word_input_mode = selEl(['count|개수제', 'score|점수제'], student?.word_input_mode || 'count');

    // 목표값: 숫자만 입력. 종류(등급/점수)에 따라 단위·범위·placeholder 자동 조정.
    const cleanNum = (v) => (v == null ? '' : String(v).replace(/[^0-9.]/g, ''));
    f.mock_goal_type = selEl(['undecided|미정', 'grade|등급', 'score|점수'], student?.mock_goal_type || 'undecided');
    f.mock_goal_value = h('input', { type: 'number', value: cleanNum(student?.mock_goal_value) });
    f.exam_goal_type = selEl(['undecided|미정', 'grade|등급', 'score|점수'], student?.exam_goal_type || 'undecided');
    f.exam_goal_value = h('input', { type: 'number', value: cleanNum(student?.exam_goal_value) });

    // 종류에 맞춰 목표값 입력 상태(placeholder/범위/비활성) 동기화
    function syncGoal(typeSel, valInput) {
      const t = typeSel.value;
      if (t === 'undecided') {
        valInput.value = '';
        valInput.disabled = true;
        valInput.placeholder = '미정';
      } else {
        valInput.disabled = false;
        if (t === 'grade') { valInput.placeholder = '등급 (1~9)'; valInput.min = '1'; valInput.max = '9'; valInput.step = '1'; }
        else { valInput.placeholder = '점수 (0~100)'; valInput.min = '0'; valInput.max = '100'; valInput.step = '1'; }
      }
    }
    f.mock_goal_type.onchange = () => syncGoal(f.mock_goal_type, f.mock_goal_value);
    f.exam_goal_type.onchange = () => syncGoal(f.exam_goal_type, f.exam_goal_value);
    setTimeout(() => { syncGoal(f.mock_goal_type, f.mock_goal_value); syncGoal(f.exam_goal_type, f.exam_goal_value); }, 0);

    const schoolDatalist = h('datalist', { id: 'schoolList' },
      ...(state.schools || []).map((s) => h('option', { value: s.name })));

    const save = async () => {
      const body = {
        teacher_id: teacher.id,
        name: f.name.value,
        school: f.school.value,
        school_level: f.school_level.value,
        grade: f.grade.value,
        class_name: f.class_name.value,
        age: f.age.value ? Number(f.age.value) : null,
        subject: f.subject.value,
        word_input_mode: f.word_input_mode.value,
        mock_goal_type: f.mock_goal_type.value,
        mock_goal_value: f.mock_goal_type.value === 'undecided' ? '' : f.mock_goal_value.value,
        exam_goal_type: f.exam_goal_type.value,
        exam_goal_value: f.exam_goal_type.value === 'undecided' ? '' : f.exam_goal_value.value,
      };
      try {
        if (student) await api.put(`/api/students/${student.id}`, body);
        else await api.post('/api/students', body);
        toast('저장되었습니다.', 'success');
        close();
        onSaved && onSaved();
      } catch (e) { toast(e.message, 'error'); }
    };

    return modalShell({
      title: student ? '학생 정보 수정' : '학생 추가', close,
      body: h('div', {},
        schoolDatalist,
        field('학생명 *', f.name),
        h('div', { class: 'form-grid' },
          field('학교', f.school),
          field('학교급', f.school_level),
          field('학년', f.grade),
          field('분반명', f.class_name),
          field('나이', f.age),
          field('과목', f.subject),
          field('단어 입력 방식', f.word_input_mode),
        ),
        h('div', { class: 'form-grid' },
          field('모의고사 목표 종류', f.mock_goal_type),
          field('모의고사 목표값', f.mock_goal_value),
          field('내신 목표 종류', f.exam_goal_type),
          field('내신 목표값', f.exam_goal_value),
        ),
      ),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '저장')],
    });
  });
}

function selEl(options, current) {
  const s = h('select');
  for (const opt of options) {
    const [value, label] = opt.split('|');
    const o = h('option', { value }, label);
    if (value === current) o.selected = true;
    s.appendChild(o);
  }
  return s;
}
