// 서버를 인프로세스로 띄우지 않고, 외부에서 띄운 서버에 대해 전체 API 흐름을 검증한다.
// 사용: node --experimental-sqlite scripts/smoke-test.js  (서버가 같은 프로세스 그룹에서 실행 중일 때)
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const results = [];

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, ct, data };
}

function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  ok  ${name}`); }
  else { fail++; results.push(`FAIL  ${name} ${extra}`); }
}

async function main() {
  // 정적 파일
  let r = await call('GET', '/');
  check('GET / (index.html)', r.status === 200 && String(r.data).includes('CP 매니저'));
  for (const asset of ['/styles.css', '/js/main.js', '/js/api.js', '/js/views/detail.js', '/js/views/sections/shop.js', '/word-widget.html', '/remote.html']) {
    r = await call('GET', asset);
    check(`GET ${asset}`, r.status === 200, `status=${r.status}`);
  }

  // 강사
  r = await call('GET', '/api/teachers');
  check('강사 목록', r.status === 200 && Array.isArray(r.data.teachers) && r.data.teachers.length >= 1);
  const t = r.data.teachers.find((x) => x.name === '김영어') || r.data.teachers[0];

  // 학생 목록 + 상세
  r = await call('GET', `/api/students?teacher_id=${t.id}&scope=mine`);
  check('학생 목록', r.status === 200 && r.data.students.length >= 1);
  const stu = r.data.students[0];
  check('학생 CP 요약 포함', typeof stu.available_cp === 'number' && typeof stu.pending_cp === 'number' && typeof stu.cumulative_cp === 'number');

  r = await call('GET', `/api/students/${stu.id}/detail`);
  check('학생 상세', r.status === 200 && r.data.student && Array.isArray(r.data.ledger) && Array.isArray(r.data.lessons));

  // 수업 생성 -> CP 반영 -> 수정 -> 삭제
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  r = await call('POST', `/api/students/${stu.id}/lessons`, { lesson_date: today, attendance: 'present', word_status: 'taken', word_seen: 50, word_wrong: 0, deadline_met: 1 });
  check('수업 생성', r.status === 200 && r.data.lesson.id, JSON.stringify(r.data));
  const lessonId = r.data.lesson && r.data.lesson.id;
  r = await call('GET', `/api/students/${stu.id}/ledger`);
  const hasLessonLedger = r.data.ledger.some((l) => l.source_type === 'lesson' && l.source_id === lessonId && l.amount === 15);
  check('수업 생성 시 만점 +15 장부', hasLessonLedger);

  r = await call('PUT', `/api/lessons/${lessonId}`, { word_wrong: 10 });
  check('수업 수정', r.status === 200);
  r = await call('GET', `/api/students/${stu.id}/ledger`);
  const recomputed = r.data.ledger.some((l) => l.source_id === lessonId && l.amount === 10);
  check('수정 후 +10 재계산', recomputed);

  r = await call('DELETE', `/api/lessons/${lessonId}`);
  check('수업 삭제', r.status === 200);
  r = await call('GET', `/api/students/${stu.id}/ledger`);
  check('삭제 후 장부 제거', !r.data.ledger.some((l) => l.source_id === lessonId && l.source_type === 'lesson'));

  // '기타' 사유 필수 검증
  r = await call('POST', `/api/students/${stu.id}/lessons`, { lesson_date: today, word_status: 'etc' });
  check("'기타' 사유 필수 400", r.status === 400 && r.data.code === 'VALIDATION', `status=${r.status}`);

  // 코치
  r = await call('GET', `/api/students/${stu.id}/coach`);
  check('AI 코치 4영역', r.status === 200 && 'facts' in r.data && 'problems' in r.data && 'plan' in r.data && 'actions' in r.data);

  // 랭킹
  r = await call('GET', `/api/teachers/${t.id}/ranking?basis=cumulative`);
  check('랭킹 누적', r.status === 200 && Array.isArray(r.data.rows) && r.data.rows.every((x, i, a) => i === 0 || a[i - 1].cp >= x.cp));
  r = await call('GET', `/api/teachers/${t.id}/ranking?basis=monthly`);
  check('랭킹 월간', r.status === 200);

  // 상점 흐름
  r = await call('POST', `/api/teachers/${t.id}/products`, { name: '스모크상품', base_cp: 10 });
  check('상품 생성', r.status === 200 && r.data.product.id);
  const prodId = r.data.product.id;
  // 즉시 CP 지급 후 구매
  await call('POST', `/api/students/${stu.id}/manual-cp`, { amount: 50, reason: '스모크', immediate: true });
  r = await call('POST', `/api/students/${stu.id}/purchase`, { product_id: prodId });
  check('상품 구매', r.status === 200 && r.data.purchase.inventory_state === 'owned', JSON.stringify(r.data));
  const purchaseId = r.data.purchase && r.data.purchase.id;
  r = await call('PUT', `/api/purchases/${purchaseId}/state`, { state: 'used' });
  check('상품 사용 처리', r.status === 200 && r.data.purchase.inventory_state === 'used');
  r = await call('DELETE', `/api/purchases/${purchaseId}`);
  check('구매 환불', r.status === 200);

  // 참여
  r = await call('POST', `/api/students/${stu.id}/participation`, { lesson_date: today, delta: 1 });
  await call('POST', `/api/students/${stu.id}/participation`, { lesson_date: today, delta: 1 });
  r = await call('POST', `/api/students/${stu.id}/participation`, { lesson_date: today, delta: 1 });
  check('참여 3스택', r.status === 200 && r.data.result.stack === 3 && r.data.result.bonus_given === 1);
  // 정리
  await call('POST', `/api/students/${stu.id}/participation`, { lesson_date: today, delta: -1 });
  await call('POST', `/api/students/${stu.id}/participation`, { lesson_date: today, delta: -1 });
  await call('POST', `/api/students/${stu.id}/participation`, { lesson_date: today, delta: -1 });

  // 시험 분석
  r = await call('GET', `/api/students/${stu.id}/exam-analysis`);
  check('시험 분석', r.status === 200 && 'typeAccuracy' in r.data);

  // 백업 내보내기
  r = await call('GET', `/api/backup/export?teacher_id=${t.id}`);
  check('백업 내보내기', r.status === 200 && r.data.tables && r.data.tables.students);

  // 가이드 초안
  r = await call('GET', `/api/teachers/${t.id}/guide/draft`);
  check('의의·규칙 초안 생성', r.status === 200 && r.data.draft.includes('CP 매니저의 의의 및 규칙'));

  // 404 / 잘못된 엔드포인트
  r = await call('GET', '/api/nonexistent');
  check('없는 엔드포인트 404', r.status === 404);
  r = await call('GET', '/api/students/999999/detail');
  check('없는 학생 404', r.status === 404);

  console.log(results.join('\n'));
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('smoke-test error:', e); process.exit(1); });
