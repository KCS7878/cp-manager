// 학생 읽기 전용 화면. 편집 기능 없음.
import { h, clear, toast, loadingEl, errorEl, openModal, modalShell } from '../ui.js';
import { api } from '../api.js';

export async function renderStudentView(root, studentId, { onExit } = {}) {
  clear(root);
  root.appendChild(loadingEl('내 정보를 불러오는 중...'));

  let data;
  try {
    data = await api.get(`/api/students/${studentId}/public`, { timeout: 12000 });
  } catch (e) {
    clear(root);
    root.appendChild(errorEl(new Error('정보를 불러오지 못했습니다: ' + e.message), () => renderStudentView(root, studentId, { onExit })));
    return;
  }

  clear(root);
  const s = data.student;
  const cp = data.cp;

  const wrap = h('div', { class: 'student-view' });

  // 상단 인사
  wrap.appendChild(h('div', { class: 'sv-greeting' },
    h('div', {},
      h('div', { class: 'sv-hi' }, `${s.name} 님, 안녕하세요! 👋`),
      h('div', { class: 'sv-sub muted' }, [s.grade, s.school, s.class_name].filter(Boolean).join(' · ') + (s.teacher ? ` · ${s.teacher} 선생님` : '')),
    ),
    onExit ? h('button', { class: 'btn sm secondary', onClick: onExit }, '나가기') : null,
  ));

  // CP 히어로 (가용 CP 강조)
  const total = cp.available + cp.pending;
  const availPct = total > 0 ? Math.round((cp.available / total) * 100) : 0;
  wrap.appendChild(h('div', { class: 'card' },
    h('div', { class: 'section-body' },
      h('div', { class: 'cp-hero', style: { border: 'none', boxShadow: 'none', padding: 0 } },
        h('div', { class: 'cp-hero-main' },
          h('div', { class: 'cp-hero-big' },
            h('span', { class: 'cp-hero-num' }, String(cp.available)),
            h('span', { class: 'cp-hero-unit' }, 'CP'),
          ),
          h('div', { class: 'cp-hero-caption' }, '지금 바로 쓸 수 있는 CP'),
          h('span', { class: 'cp-exchange-badge' + (cp.available > 0 ? '' : ' off') },
            cp.available > 0 ? '🎁 상품 교환 가능' : '교환 가능 CP 부족'),
        ),
        h('div', { class: 'cp-hero-sub' },
          subMetric('pending', cp.pending, '지급 예정 CP', '다음 달 1일 전환'),
          subMetric('next', cp.available + cp.pending, '다음 달 사용 가능', '대기분 포함'),
        ),
        h('div', { class: 'cp-bar' }, h('div', { class: 'cp-bar-fill', style: { width: availPct + '%' } })),
        h('div', { class: 'cp-bar-labels' },
          h('span', { class: 'muted' }, `누적 CP ${cp.cumulative}`),
          h('span', { class: 'muted' }, '지급 예정 CP는 다음 달 1일부터 사용 가능'),
        ),
      )
    )
  ));

  // 내 랭킹
  const rk = data.ranking;
  wrap.appendChild(h('div', { class: 'card' },
    h('div', { class: 'section-body' },
      h('h3', { class: 'sv-section-title' }, '🏆 내 랭킹'),
      h('div', { class: 'sv-rank-row' },
        rankCard('누적 CP', rk.cumulative.myRank, rk.cumulative.total, rk.cumulative.myCp),
        rankCard('이번 달', rk.monthly.myRank, rk.monthly.total, rk.monthly.myCp, rk.monthly.monthKey),
      ),
      h('div', { class: 'sv-rank-note muted' }, '전체 랭킹 TOP 10'),
      renderRankList(rk.cumulative.top, s.name),
    )
  ));

  // 단어시험 추세
  if (data.wordTrend && data.wordTrend.length) {
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-body' },
        h('h3', { class: 'sv-section-title' }, '📚 내 단어시험 기록'),
        h('div', { class: 'table-scroll' },
          h('table', { class: 'data' },
            h('thead', {}, h('tr', {}, h('th', {}, '날짜'), h('th', {}, '범위'), h('th', {}, '점수'), h('th', {}, '기한'))),
            h('tbody', {}, ...data.wordTrend.map((w) => h('tr', {},
              h('td', {}, w.date),
              h('td', { class: 'wrap-anywhere' }, w.range || '-'),
              h('td', {}, `${w.score}점`),
              h('td', {}, w.deadlineMet ? h('span', { class: 'pos' }, '내') : h('span', { class: 'neg' }, '초과')),
            ))),
          )
        )
      )
    ));
  }

  // 시험 분석 (유형별 정답률)
  const ea = data.examAnalysis;
  if (ea && ((ea.typeAccuracy && ea.typeAccuracy.length) || (ea.mockTrend && ea.mockTrend.length) || (ea.schoolTrend && ea.schoolTrend.length))) {
    const body = h('div', { class: 'section-body' }, h('h3', { class: 'sv-section-title' }, '📈 내 시험 분석'));
    // 목표
    body.appendChild(h('div', { class: 'sv-goals' },
      goalChip('모의 목표', s.mock_goal_type, s.mock_goal_value),
      goalChip('내신 목표', s.exam_goal_type, s.exam_goal_value),
    ));
    if (ea.typeAccuracy && ea.typeAccuracy.length) {
      body.appendChild(h('div', { class: 'table-scroll', style: { marginTop: '0.6rem' } },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, '유형'), h('th', {}, '정답/전체'), h('th', {}, '정답률'))),
          h('tbody', {}, ...ea.typeAccuracy.map((t) => h('tr', {},
            h('td', {}, t.type), h('td', {}, `${t.correct}/${t.total}`),
            h('td', { class: t.rate !== null && t.rate < 60 ? 'neg' : 'pos' }, t.rate !== null ? `${t.rate}%` : '-'),
          ))),
        )
      ));
    }
    wrap.appendChild(h('div', { class: 'card' }, body));
  }

  // ── 점수 입력 (학생이 시험/모의고사 점수를 제출 → 선생님 승인) ──
  wrap.appendChild(renderScoreSubmit(studentId, data, () => renderStudentView(root, studentId, { onExit })));

  // 상점 (구매 가능한 상품 — 읽기 전용, 교환은 선생님에게)
  if (data.products && data.products.length) {
    const grid = h('div', { class: 'product-grid' });
    for (const p of data.products) {
      const affordable = cp.available >= p.effective_cp;
      grid.appendChild(h('div', { class: 'product-card' + (affordable ? '' : ' p-ended') },
        p.image_url ? h('img', { src: p.image_url, alt: p.name }) : h('div', { class: 'p-noimg' }, '🎁'),
        h('div', { class: 'p-body' },
          h('div', { class: 'p-name wrap-anywhere' }, p.name),
          p.description ? h('div', { class: 'muted wrap-anywhere', style: { fontSize: '0.8rem' } }, p.description) : null,
          h('div', { class: 'p-cp' }, `${p.effective_cp} CP`),
          h('div', { class: affordable ? 'sv-afford' : 'sv-notafford' }, affordable ? '✅ 교환 가능' : `${p.effective_cp - cp.available} CP 더 필요`),
        )));
    }
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-body' },
        h('h3', { class: 'sv-section-title' }, '🛒 상점 (CP로 교환 가능한 상품)'),
        h('p', { class: 'muted', style: { marginTop: '-0.3rem', marginBottom: '0.7rem', fontSize: '0.84rem' } }, '교환을 원하면 선생님께 말씀하세요. (이 화면은 보기 전용)'),
        grid,
      )));
  }

  // 보유 상품 (인벤토리)
  wrap.appendChild(h('div', { class: 'card' },
    h('div', { class: 'section-body' },
      h('h3', { class: 'sv-section-title' }, '🎒 내 보유 상품'),
      data.inventory && data.inventory.length
        ? h('div', { class: 'table-scroll' },
            h('table', { class: 'data' },
              h('thead', {}, h('tr', {}, h('th', {}, '상품'), h('th', {}, '구매일'), h('th', {}, '상태'))),
              h('tbody', {}, ...data.inventory.map((p) => h('tr', {},
                h('td', { class: 'wrap-anywhere' }, p.product_name),
                h('td', {}, (p.purchased_at || '').slice(0, 10)),
                h('td', {}, h('span', { class: 'pill ' + (p.inventory_state === 'used' ? 'none' : 'present') }, p.inventory_state === 'used' ? '사용완료' : '보유중')),
              ))),
            )
          )
        : h('div', { class: 'empty' }, '아직 구매한 상품이 없어요. CP를 모아 상점에서 교환해 보세요!'),
    )
  ));

  // 최근 CP 지급 내역 (읽기 전용)
  if (data.ledger && data.ledger.length) {
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'section-body' },
        h('h3', { class: 'sv-section-title' }, '📒 내 CP 받은 내역'),
        h('div', { class: 'table-scroll' },
          h('table', { class: 'data' },
            h('thead', {}, h('tr', {}, h('th', {}, '날짜'), h('th', {}, '내용'), h('th', {}, 'CP'))),
            h('tbody', {}, ...data.ledger.slice(0, 20).map((l) => h('tr', {},
              h('td', {}, l.occurred_date),
              h('td', { class: 'wrap-anywhere' }, l.reason),
              h('td', { class: l.amount >= 0 ? 'pos' : 'neg' }, (l.amount > 0 ? '+' : '') + l.amount),
            ))),
          )
        ),
      )
    ));
  }

  wrap.appendChild(h('div', { class: 'sv-footer muted' }, '이 화면은 보기 전용입니다. 기록 수정은 선생님께 문의하세요.'));
  root.appendChild(wrap);

  function subMetric(cls, v, label, note) {
    return h('div', { class: `cp-submetric ${cls}` },
      h('div', { class: 'cp-submetric-v' }, String(v)),
      h('div', { class: 'cp-submetric-l' }, label),
      h('div', { class: 'cp-submetric-note' }, note));
  }
  function rankCard(label, rank, total, cp, monthKey) {
    return h('div', { class: 'sv-rank-card' },
      h('div', { class: 'sv-rank-label' }, label + (monthKey ? ` (${monthKey})` : '')),
      h('div', { class: 'sv-rank-big' }, rank ? `${rank}위` : '-'),
      h('div', { class: 'sv-rank-meta muted' }, (total ? `${total}명 중` : '') + ` · ${cp} CP`));
  }
  function goalChip(label, type, val) {
    const txt = (type === 'undecided' || val == null || val === '') ? '미정'
      : (type === 'grade' ? `${String(val).replace(/[^0-9.]/g, '')}등급` : `${String(val).replace(/[^0-9.]/g, '')}점`);
    return h('div', { class: 'sv-goal-chip' }, h('span', { class: 'muted' }, label), h('strong', {}, txt));
  }
}

function renderRankList(top, myName) {
  const box = h('div', { class: 'sv-ranklist' });
  for (const r of top) {
    const isMe = r.name === myName;
    const rankCls = r.rank === 1 ? 'top1' : r.rank === 2 ? 'top2' : r.rank === 3 ? 'top3' : '';
    box.appendChild(h('div', { class: 'rank-row' + (isMe ? ' me' : '') },
      h('span', { class: 'rank-num ' + rankCls }, r.rank),
      h('span', { class: 'rank-name wrap-anywhere' }, r.name + (isMe ? ' (나)' : '') + (r.grade ? ` · ${r.grade}` : '')),
      h('span', { class: 'rank-cp' }, `${r.cp} CP`),
    ));
  }
  return box;
}

// ── 점수 입력 섹션: 학생이 시험 점수를 제출하고, 내가 제출한 점수의 상태를 본다 ──
function renderScoreSubmit(studentId, data, reload) {
  const EXAM_LABEL = { school: '내신', mock: '모의고사' };
  const STATUS_LABEL = { pending: '검토 대기', confirmed: '승인됨' };
  const submitted = data.mySubmittedExams || [];

  const body = h('div', { class: 'section-body' });
  body.appendChild(h('h3', { class: 'sv-section-title' }, '✏️ 점수 입력'));
  body.appendChild(h('p', { class: 'muted', style: { marginTop: '-0.3rem', marginBottom: '0.7rem', fontSize: '0.84rem' } },
    '학교 시험이나 모의고사 점수를 입력해 제출하면, 선생님이 확인 후 성적에 반영합니다.'));

  body.appendChild(h('div', { class: 'btn-row', style: { marginBottom: '0.7rem' } },
    h('button', { class: 'btn sm', onClick: () => openScoreForm(studentId, reload) }, '＋ 점수 제출하기')));

  if (submitted.length) {
    body.appendChild(h('div', { class: 'card-table' }, h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, '종류'), h('th', {}, '시험명'), h('th', {}, '시험일'), h('th', {}, '점수'), h('th', {}, '상태'))),
        h('tbody', {}, ...submitted.map((e) => h('tr', {},
          h('td', { 'data-label': '종류' }, EXAM_LABEL[e.exam_type] || e.exam_type),
          h('td', { 'data-label': '시험명', class: 'wrap-anywhere' }, e.exam_name),
          h('td', { 'data-label': '시험일' }, e.exam_date),
          h('td', { 'data-label': '점수' }, (e.score != null ? `${e.score}점` : '-') + (e.grade ? ` (${e.grade}등급)` : '')),
          h('td', { 'data-label': '상태' },
            h('span', { class: 'pill ' + (e.status === 'confirmed' ? 'present' : 'late') }, STATUS_LABEL[e.status] || e.status)),
        ))),
      )
    )));
  } else {
    body.appendChild(h('div', { class: 'empty' }, '아직 제출한 점수가 없습니다.'));
  }

  return h('div', { class: 'card' }, body);
}

function openScoreForm(studentId, reload) {
  openModal((close) => {
    const field = (label, el) => h('div', { class: 'field' }, h('label', {}, label), el);
    const examType = selEl(['mock|모의고사', 'school|내신'], 'mock');
    const examName = h('input', { placeholder: '예: 9월 모의고사, 2학기 중간고사' });
    const examDate = h('input', { type: 'date', value: todaySeoul() });
    const score = h('input', { type: 'number', min: '0', max: '100', placeholder: '0~100' });
    const grade = h('input', { placeholder: '예: 2 (선택)' });

    // 45문항 O/X — 기본 전부 O(맞음). 틀린 번호만 탭해서 X로 토글(다시 탭하면 O).
    const QN = 45;
    const marks = Array.from({ length: QN }, () => 'o');
    const omrGrid = h('div', { class: 'omr-simple' });
    function paintOmr() {
      omrGrid.innerHTML = '';
      for (let i = 0; i < QN; i++) {
        const cur = marks[i];
        const cell = h('button', {
          type: 'button',
          class: 'omr-cell ' + (cur === 'x' ? 'is-x' : 'is-o'),
          title: `${i + 1}번`,
          onClick: () => { marks[i] = marks[i] === 'o' ? 'x' : 'o'; paintOmr(); updateWrong(); },
        }, h('span', { class: 'omr-no' }, String(i + 1)), h('span', { class: 'omr-mk' }, cur === 'x' ? 'X' : 'O'));
        omrGrid.appendChild(cell);
      }
    }
    const wrongInfo = h('div', { class: 'omr-wrong-info muted' }, '');
    function updateWrong() {
      const wrong = marks.filter((m) => m === 'x').length;
      wrongInfo.textContent = wrong === 0 ? '모두 맞음 (45/45)' : `틀린 문항 ${wrong}개 · 맞은 문항 ${QN - wrong}개`;
    }
    const resetAllO = h('button', { type: 'button', class: 'btn sm secondary', onClick: () => { marks.fill('o'); paintOmr(); updateWrong(); } }, '전부 맞음(O)으로');

    const omrSection = h('div', { class: 'omr-section' },
      h('div', { class: 'omr-head' },
        h('strong', {}, '문항별 정답 체크 (45문항)'),
        resetAllO,
      ),
      h('div', { class: 'hint', style: { margin: '0.2rem 0 0.5rem' } }, '기본은 전부 O(맞음)입니다. 틀린 번호만 눌러 X로 바꾸세요.'),
      omrGrid,
      wrongInfo,
    );
    paintOmr(); updateWrong();

    function refreshType() {
      omrSection.style.display = examType.value === 'mock' ? '' : 'none';
    }
    examType.onchange = refreshType;
    setTimeout(refreshType, 0);

    const save = async () => {
      if (!examName.value.trim()) { toast('시험명을 입력하세요.', 'error'); return; }
      if (score.value === '' && grade.value.trim() === '') { toast('점수나 등급 중 하나는 입력하세요.', 'error'); return; }
      const bodyData = {
        exam_type: examType.value,
        exam_name: examName.value,
        exam_date: examDate.value,
        score: score.value !== '' ? Number(score.value) : null,
        grade: grade.value,
      };
      // 모의고사면 45문항 O/X 포함 (서버 items 형식: {1:'o'|'x', ...})
      if (examType.value === 'mock') {
        const items = {};
        marks.forEach((m, i) => { items[i + 1] = m; });
        bodyData.items = items;
      }
      try {
        await api.post(`/api/students/${studentId}/exams/self`, bodyData);
        toast('점수가 제출되었습니다. 선생님 확인 후 반영됩니다.', 'success');
        close();
        reload();
      } catch (e) { toast(e.message, 'error'); }
    };

    return modalShell({
      title: '✏️ 점수 제출', close,
      body: h('div', {},
        h('div', { class: 'hint', style: { marginBottom: '0.6rem' } }, '제출한 점수는 선생님이 확인·승인한 뒤 내 성적에 반영됩니다.'),
        h('div', { class: 'form-grid' }, field('시험 종류', examType), field('시험일', examDate)),
        field('시험명', examName),
        h('div', { class: 'form-grid' }, field('점수 (0~100)', score), field('등급 (선택)', grade)),
        omrSection,
      ),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '취소'), h('button', { class: 'btn', onClick: save }, '제출')],
    });
  });
}

function todaySeoul() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function selEl(options, current) {
  const sel = h('select');
  for (const opt of options) { const [v, l] = opt.split('|'); const o = h('option', { value: v }, l); if (v === current) o.selected = true; sel.appendChild(o); }
  return sel;
}
