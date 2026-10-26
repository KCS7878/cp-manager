# CP 매니저 — 주요 기능 검수표

✅ = 구현 및 검증 완료 (테스트/스모크/코드 확인)

## 2. 기본 시스템 구조
- ✅ 사이트 접근 보호(`CP_ADMIN_KEY` → `x-admin-key`) — `server/index.js`
- ✅ 강사 선택은 로그인이 아닌 작업 범위 선택 — `teacher-select.js`
- ✅ 진입 흐름: 강사 목록 우선 → 강사 선택 → 학생·규칙 → 학생 상세 별도 로드 — `main.js`
- ✅ 강사 목록 로딩 실패를 "강사 없음"으로 처리하지 않음, 오류 + 다시 시도 + 캐시 표시 — `main.js:loadTeachers`
- ✅ 원본 기록은 서버 DB에만 저장, localStorage는 허용 항목만(마지막 강사/접힘/UI설정/강사 캐시) — `state.js`
- ✅ 추가·수정·삭제 시 CP 장부·잔액을 트랜잭션으로 함께 처리 — `connection.js:transaction`, 각 서비스

## 3. 핵심 데이터 구조
- ✅ 강사/학교/학생/분반/수업/출결/단어시험/내신·모의/CP장부/월간보너스/강사규칙/학생예외규칙/참여/상품/학생별가격/구매/인벤토리/분기칭호/의의규칙/백업 — `schema.sql`
- ✅ 학생 필수 항목(학생명·강사·학교·학년·분반·나이·과목·모의목표·내신목표·가용/대기/누적 CP) — `students` + `getStudent`

## 4. 메인 관리 화면
- ✅ 강사 카드 선택 → 담당 학생 목록 — `teacher-select.js`, `workspace.js`
- ✅ 검색·필터·정렬(담당/전체, 강사, 학교, 분반, 이름, CP 오름/내림, 중/고) — `workspace.js`, `student-service.js:listStudents`
- ✅ 학교급 선택 → 학년 단계 UI(중1~3 / 고1~3) — `workspace.js:renderGradeStep`
- ✅ 학년·학교·분반·이름·가용/대기 CP 시인성 표시 — 학생 목록 아이템
- ✅ 학생 전환 시 상세만 요청 + 메모리 캐시 + 이전 요청 취소 — `main.js:loadStudentDetail`, `api.js(signalOwnerKey)`
- ✅ 모든 영역 개별 접기/펼치기 + 전체 펼치기/접기 — `section.js`, `detail.js`

## 5. 수업·출결·단어시험
- ✅ 수업 기록 추가·수정·삭제 — `lessons.js`, `lesson-service.js`
- ✅ 수업 항목 전체(수업일·출결·지각시간·단어상태·범위·본/틀림·점수·기한·진도·방향·약점·숙제·진도율)
- ✅ 단어시험 상태 4종, '기타' 사유 필수 + CP 변동 없음 — 서버 검증(스모크 통과)
- ✅ 단어 범위 자유 텍스트 입력
- ✅ 개수제(자동 환산) / 점수제 — `cp-engine.js:countToScore`, 학생 `word_input_mode`

## 6. CP 계산 규칙
- ✅ 강사 공통 + 학생 예외 규칙, 수치 변경 가능 — `rules.js`, `student-rules.js`, `rules-service.js`
- ✅ 기본값(통과80/+10/+5/-5/-10/지각5분·1분당-1/월30·30) — `cp-engine.js:DEFAULT_RULES` (단위 테스트)
- ✅ 이번 달=대기 → 다음 달 1일 가용 전환, 즉시 지급 지원 — `ledger-service.js`
- ✅ 수정·삭제 시 이전 효과 되돌린 뒤 재계산 — `recomputeLessonLedger` (통합/스모크 테스트)
- ✅ 장부 필드(금액·사유·발생일·사용가능일·상태·원본종류/ID) — `cp_ledger`

## 7. 단어 점수 위젯
- ✅ 별도 작은 팝업 창(`/word-widget.html`), 10단계 입력
- ✅ 미응시 체크 시 점수 비활성화 + 미응시 CP
- ✅ 예상 CP 미리보기, 저장 시 메인 즉시 반영(`cp:data-changed` 이벤트)

## 8. 출결 및 월간 보너스
- ✅ 출석/지각/결석 별도 기록, 독립 출결 + 수업 연결 — `attendance.js`
- ✅ 수정·삭제 시 CP 자동 조정
- ✅ 완료 월 보너스 자동 계산(무지각 / 단어 성실, 미응시·기한초과 시 제외) — `bonus-service.js`
- ✅ 관리자 금액 수정·제거 — `adjustMonthlyBonus`, `removeMonthlyBonus`

## 9. 내신·모의고사 분석
- ✅ 시험 항목(종류·시험명·시험일·점수·잘한점·약점·피드백) — `exams.js`, `exam-service.js`
- ✅ 모의고사 1~45 문항별 O/X 선택 기록 — OMR 그리드
- ✅ 유형 구분(듣기1~17 + 18개 유형) — `exam-types.js`
- ✅ 미입력 문항은 오답 아닌 분석 제외
- ✅ 점수 추세·목표 차이·유형별 누적 정답률·반복 오답 유형 — `analyzeExams`

## 10. AI 학습 코치
- ✅ 4영역 분리(사실/문제/해결/행동) + 단어 추세 + 유형 분석 — `coach-service.js`, `coach.js`
- ✅ 시각 규칙(숫자 굵게/약점 붉은색/해결 보라/행동 초록/인용 이탤릭) — `coach.js` + CSS
- ✅ 실제 데이터 근거, 근거 부족 시 "분석 근거 부족" + 필요 데이터 안내
- ✅ 외부 AI 없거나 실패해도 규칙 기반 분석 항상 제공 (키는 서버에서만 사용하도록 설계)

## 11. 수업 참여 리모콘
- ✅ 별도 작은 팝업 창(`/remote.html`), 강사·분반·수업일 선택
- ✅ 참여+1 / 정정-1, 하루 최대 3회
- ✅ 3스택 시 +5 대기 CP, 2회 정정 시 회수 — `participation-service.js` (통합/스모크 테스트)
- ✅ 메인 즉시 반영

## 12. 랭킹
- ✅ 누적 CP / 이번 달 획득 CP 전환(둘 다 구매 제외) — `ranking-service.js` (스모크: 정렬·구매제외 검증)
- ✅ 필터(전체/학년/학교/분반) + 학년·학교·분반·순위·CP 표시
- ✅ 심볼 토글 기본 OFF(분기 칭호/개근상/DAY STREAK) — `cp_rules`
- ✅ 분기 칭호(직전 분기 1~3위 고정, 분기 시작 확정, 과거 수정에도 불변) — `confirmQuarterTitles` + `quarter_titles`
- ✅ 개근상(지난달 4조건), DAY STREAK(단어 연속 응시), PERFECT(만점 횟수)
- ✅ TOP 10 PNG 저장(심볼 간격 확보) — `png.js`, `ranking.js` + `#rankCapture` CSS

## 13. 상점·구매내역·인벤토리
- ✅ 강사별 상품 추가·수정·종료 — `shop.js`, `shop-service.js`
- ✅ 상품 정보(상품명·설명·기본CP·원화·이미지·상태) + 이미지 업로드 — `upload-service.js`
- ✅ 학생별 가격 override
- ✅ 3보기(상점/구매내역/인벤토리), 구매내역 기본 전체 + 특정 학생 필터
- ✅ 구매 시 가용 CP 차감 + 보유 추가, 사용 완료 전환, 보유 정정 — (스모크 테스트)

## 14. 의의 및 규칙
- ✅ 규칙 반영 기본 초안 자동 생성(6개 항목) — `generateGuideDraft`
- ✅ 직접 편집·저장, 최대 12,000자 — `guide.js`, `updateGuide`
- ✅ PNG 캡처 — `guide-section.js`

## 15. 백업 및 PC 연동
- ✅ JSON 내보내기(학생·수업·출결·시험·장부·보너스·규칙·상품·구매·인벤토리·참여) — `backup-service.js`
- ✅ JSON 불러오기, 불러오기 전 자동 백업, 명시적 확인 후에만 덮어쓰기
- ✅ 웹 vs 파일 비교(건수 차이 표시) 후 기준 선택, 자동 병합 안 함 — `compareData`, `backup.js`

## 16. 디자인
- ✅ 지정 색상 팔레트 + 폰트 순서(Pretendard…) — `styles.css`
- ✅ 확대 시 상자 밖 이탈 방지(자동 줄바꿈/min-width:0/유동 그리드/줄바꿈/좁은 화면 1열/고정 높이 최소화)
- ✅ 학생 이름에 경고 빨간색 미사용

## 17. 안정성 및 성능
- ✅ 서버측 입력 검증 — `validation.js` + 각 서비스
- ✅ 삭제 전 확인 창 — `confirmDialog`
- ✅ 학생 삭제 시 연결 기록 범위 안내 — `deletion-impact`
- ✅ 오류로 빈 데이터 덮어쓰기 방지(오류 시 화면 유지, 복원은 확인·자동백업)
- ✅ JSON 파싱 실패/404/500/504/타임아웃 구분 — `api.js`
- ✅ 무한 대기 대신 타임아웃 + 다시 시도 — `api.js`, `ui.js:errorEl`
- ✅ 중복 요청 방지(dedup) + 이전 요청 취소(signalOwnerKey) — `api.js`
- ✅ CP 변경과 장부 기록 단일 트랜잭션 — `transaction`
- ✅ 서버 오류 시 기존 화면 데이터 유지
- ✅ 학생 전환 시 전체 재요청 안 함
- ✅ 모바일 추가·수정·저장 지원(반응형 모달/폼)
- ✅ 키보드 조작·포커스 표시(:focus-visible, role/tabindex, Esc 닫기)

## 18. 최종 결과물
- ✅ 1~10 전 항목 제공(README.md), 모든 버튼 실제 동작, 하드코딩 샘플/가짜 버튼/휘발성 데이터 없음

## 테스트 결과
- 단위 14 + 통합 11 = **25 통과** (`npm test`)
- E2E 스모크 **32 통과** (`npm run smoke`, 서버 실행 중)
- 프런트 모듈 그래프 로드 **24개 OK**
