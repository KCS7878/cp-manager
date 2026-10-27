// 시작 화면: 선생님/학생 역할 선택 + 접속 코드 입력.
import { h, clear, toast } from '../ui.js';
import { api, setAdminCode } from '../api.js';

const LS_ROLE = 'cp.lastRole';
const LS_CODE = 'cp.lastCode';

/**
 * onTeacher(teacher): 선생님 코드 확인 후 (관리자 화면으로)
 * onStudent(studentId): 학생 코드 확인 후 (읽기 전용 화면으로)
 * onAdmin(): 총관리자 코드 확인 후 (전체 강사 관리 화면으로)
 */
export function renderEntry(root, { onTeacher, onStudent, onAdmin }) {
  clear(root);

  let role = null; // 'teacher' | 'student'

  const wrap = h('div', { class: 'entry-wrap' });
  const card = h('div', { class: 'card entry-card' });

  const brand = h('div', { class: 'ts-brand' },
    h('div', { class: 'ts-logo' }, 'CP'),
    h('div', {},
      h('div', { class: 'ts-brand-title' }, 'CP 매니저'),
      h('div', { class: 'ts-brand-sub' }, '학습 기록·보상 관리')
    )
  );

  const roleRow = h('div', { class: 'entry-role-row' });
  const teacherBtn = h('button', { class: 'entry-role-btn', onClick: () => pick('teacher') },
    h('div', { class: 'entry-role-icon' }, '👩‍🏫'),
    h('div', { class: 'entry-role-title' }, '선생님'),
    h('div', { class: 'entry-role-desc' }, '학생 관리·CP 지급')
  );
  const studentBtn = h('button', { class: 'entry-role-btn', onClick: () => pick('student') },
    h('div', { class: 'entry-role-icon entry-role-icon-imgs' },
      h('img', { src: 'assets/ST_male.png', alt: '남학생', class: 'entry-role-img' }),
      h('img', { src: 'assets/ST_female.png', alt: '여학생', class: 'entry-role-img' }),
    ),
    h('div', { class: 'entry-role-title' }, '학생'),
    h('div', { class: 'entry-role-desc' }, '내 CP·랭킹 확인')
  );
  roleRow.appendChild(teacherBtn);
  roleRow.appendChild(studentBtn);

  const codeWrap = h('div', { class: 'entry-code-wrap', style: { display: 'none' } });
  const codeLabel = h('div', { class: 'entry-code-label' });
  const codeInput = h('input', { class: 'entry-code-input', placeholder: '예: T-ABC123', autocapitalize: 'characters', autocomplete: 'off' });
  const submitBtn = h('button', { class: 'btn', style: { width: '100%' }, onClick: submit }, '접속');
  const errBox = h('div', { class: 'entry-err', style: { display: 'none' } });
  const backBtn = h('button', { class: 'btn ghost', style: { width: '100%', marginTop: '0.4rem' }, onClick: () => pick(null) }, '← 역할 다시 선택');

  // 강사 생성은 총관리자 전용 기능으로 이동됨 (이 화면에는 '새 강사 만들기' 노출 안 함)

  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase(); errBox.style.display = 'none'; });

  codeWrap.appendChild(codeLabel);
  codeWrap.appendChild(h('div', { class: 'field' }, codeInput));
  codeWrap.appendChild(errBox);
  codeWrap.appendChild(submitBtn);
  codeWrap.appendChild(backBtn);

  function pick(r) {
    role = r;
    teacherBtn.classList.toggle('active', r === 'teacher');
    studentBtn.classList.toggle('active', r === 'student');
    if (!r) { codeWrap.style.display = 'none'; return; }
    codeWrap.style.display = '';
    codeLabel.textContent = r === 'teacher'
      ? '선생님 접속 코드를 입력하세요'
      : '학생 접속 코드를 입력하세요';
    codeInput.placeholder = r === 'teacher' ? '예: T-ABC123' : '예: S-ABC123';
    codeInput.value = '';
    errBox.style.display = 'none';
    setTimeout(() => codeInput.focus(), 30);
  }

  async function submit() {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) { showErr('코드를 입력해 주세요.'); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = '확인 중...';
    try {
      const resolved = await api.post('/api/access/resolve', { code });
      // 총관리자: 어느 탭에서 입력해도 진입 허용 (숨겨진 코드)
      if (resolved.role === 'admin') {
        try { localStorage.setItem(LS_ROLE, 'admin'); } catch {}
        setAdminCode(code); // 이후 admin 전용 API 호출 시 헤더로 전송
        onAdmin && onAdmin();
        return;
      }
      // 총관리자가 아닌 접속이면 혹시 남아있을 수 있는 admin 코드 제거
      setAdminCode(null);
      // 역할 불일치 안내 (선생님/학생)
      if (role && resolved.role !== role) {
        showErr(resolved.role === 'teacher'
          ? '이 코드는 선생님 코드입니다. "선생님"을 선택해 주세요.'
          : '이 코드는 학생 코드입니다. "학생"을 선택해 주세요.');
        return;
      }
      try { localStorage.setItem(LS_ROLE, resolved.role); localStorage.setItem(LS_CODE, code); } catch {}
      if (resolved.role === 'teacher') onTeacher(resolved.teacher);
      else onStudent(resolved.student.id, resolved);
    } catch (e) {
      showErr(e.message || '코드 확인에 실패했습니다.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '접속';
    }
  }

  function showErr(msg) {
    errBox.textContent = '⚠️ ' + msg;
    errBox.style.display = '';
  }

  card.appendChild(h('div', { class: 'section-body' },
    brand,
    h('div', { class: 'ts-divider' }),
    h('div', { class: 'ts-eyebrow' }, '접속'),
    h('h2', { class: 'ts-title' }, '어떻게 접속하시나요?'),
    h('p', { class: 'muted ts-desc' }, '역할을 선택하고 발급받은 접속 코드를 입력하세요.'),
    roleRow,
    codeWrap,
  ));
  wrap.appendChild(card);
  root.appendChild(wrap);

  // 마지막 역할 자동 선택 (코드는 보안상 자동 제출하지 않음)
  try {
    const lastRole = localStorage.getItem(LS_ROLE);
    if (lastRole === 'teacher' || lastRole === 'student') pick(lastRole);
  } catch {}
}
