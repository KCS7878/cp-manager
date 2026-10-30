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
    // 과목/단어입력방식/목표(모의·내신)는 폼에서 제거. 서버 기본값(영어/개수제/미정)으로 저장되며,
    // 수정 시에는 해당 필드를 보내지 않아 기존 값이 그대로 보존된다.

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
