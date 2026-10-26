# CP 매니저 (CP Manager)

영어 강사가 여러 학생의 학습 기록과 보상 포인트(Credit Point)를 관리하는 한국어 풀스택 웹 애플리케이션입니다.
데이터 저장·수정·삭제, 자동 CP 계산, 랭킹, 상품 구매, 이미지 저장, 백업·복원이 **실제로 작동**합니다.

---

## 0. 적용한 기술 선택과 가정 (중요)

이 샌드박스는 **외부 네트워크(npm 레지스트리)에 접근할 수 없는 환경**입니다(`INTEGRATIONS_ONLY`).
따라서 요구사항에서 *권장*한 React/Next.js/better-sqlite3 등은 설치할 수 없습니다.
동일한 **데이터 안정성과 기능**을 보장하기 위해, 요구사항 2-1절의 "다른 기술을 사용해도 되지만 동일한 데이터 안정성과 기능을 보장해야 한다"에 근거하여 **외부 의존성이 0개인** 조합으로 구현했습니다.

| 영역 | 권장 | 본 구현 (가정) | 근거 |
|---|---|---|---|
| 런타임/서버 | Next.js API Routes | **로컬: 순수 Node.js 22 `http` 서버 / 배포: Cloudflare Workers** (동일 라우터·서비스 공유) | 무의존성, 서버리스 네이티브 |
| DB | SQLite / D1 / RDB | **로컬: `node:sqlite` / 배포: Cloudflare D1** (async 어댑터로 통합) | 두 환경 동일 코드, D1은 영구 저장 |
| 프런트 | React + TypeScript | **바닐라 JS (ES 모듈)** SPA | 빌드/설치 불필요, 즉시 실행 |
| 이미지 저장 | R2 / S3 | **로컬 `public/uploads`** (객체 저장소 어댑터로 추상화: `upload-service.js`만 교체하면 R2/S3 전환) | 무의존성 |
| PNG 저장 | html-to-image 등 | **SVG `foreignObject` → canvas** 직접 구현 (`public/js/png.js`) | 무의존성 |
| 시간 기준 | Asia/Seoul | Asia/Seoul UTC+9 고정 계산 (`server/lib/time.js`) | 서울은 DST 없음 |

추가 가정:
- **사이트 접근 보호**: 환경변수 `CP_ADMIN_KEY`를 설정하면 모든 `/api/*`(헬스 체크 제외)에 `x-admin-key` 헤더를 요구합니다. 미설정 시 개발 편의를 위해 보호 비활성.
- **강사 선택은 로그인이 아님**: 요구사항대로 작업 범위(강사의 학생·규칙·상품) 선택 기능입니다.
- **단어시험 통과 미달 + 기한 내**: CP 0 (패널티 없음). **미통과 + 기한 초과**: 기한초과 패널티(`pass_late_cp`) 적용.
- **월간 보너스**: 완료된 월 대상. 발생일은 다음 달 1일이며 완료된 월 결산이므로 즉시 사용 가능 CP로 반영.
- **DAY STREAK**: 출석이 아닌 "단어시험 연속 기한 내 응시" 횟수.

---

## 1. 전체 기능 설계 요약

- **강사 선택 → 학생 목록 → 학생 상세**의 3단계 점진적 로딩. 강사 목록 로딩 실패를 "강사 없음"으로 처리하지 않고 오류 + 다시 시도 제공.
- 학생 전환 시 전체 대시보드가 아닌 **선택 학생 상세만** 요청(`/api/students/:id/detail`), 메모리 캐시 + 이전 요청 취소.
- 모든 원본 기록은 서버 SQLite에 영구 저장. localStorage에는 마지막 선택 강사, 접힘 상태, UI 설정, 강사 목록 읽기 전용 캐시만 저장.
- **CP 장부(ledger) 중심** 설계: 모든 CP 증감은 장부에 기록되고, 원본 기록(수업/참여/보너스/구매/수동)과 연결. 수정·삭제 시 **이전 CP 효과를 되돌린 뒤 재계산**(트랜잭션).
- 대기/가용 CP 상태, 다음 달 1일 자동 전환, 수동 즉시 지급 지원.
- AI 학습 코치: 실제 기록 기반 규칙 분석(근거 부족 시 명시). 외부 AI 미사용으로 항상 동작.
- 랭킹(누적/월간), 필터, 분기 칭호(불변 확정), 개근상, DAY STREAK, PERFECT, TOP10 PNG.
- 상점/구매/인벤토리, 학생별 가격, 의의·규칙 안내문(PNG), 백업·복원(자동 백업 + 명시적 확인).
- 단어 점수 간편 입력기 / 수업 참여 리모콘은 **별도 팝업 창**으로 실행, 메인에 즉시 반영.

## 2. 화면 및 사용자 흐름

```
[강사 선택 화면]  ──선택──▶  [메인 관리 화면]
  (카드 그리드)                 ├─ 좌: 학생 목록(검색·필터·정렬·학년 단계 UI)
                                └─ 우: 학생 상세 (아래 섹션들, 개별 접기/펼치기 + 전체 펼치기/접기)
                                       · 학생·CP 요약   · CP 지급 내역   · AI 학습 코치
                                       · 학습 기록(수업) · 출결 관리     · 시험 분석
                                       · CP 규칙 설정    · 의의 및 규칙  · 상점·인벤토리

상단 헤더: [단어 위젯] [참여 리모콘] [랭킹] [백업] [강사 변경]  ← 팝업/모달
```

흐름 상세:
1. 강사 목록만 우선 로드(캐시 우선 표시). 2. 강사 선택. 3. 해당 강사의 학생·규칙·분반·학교 로드. 4. 첫 학생 상세를 별도 요청. 학생 전환 시 상세만 재요청(2~3초 목표, 캐시/요청 취소 적용).

## 3. 데이터베이스 스키마

전체 DDL: [`server/db/schema.sql`](server/db/schema.sql)

테이블: `teachers, schools, students, cp_rules, student_cp_rules, lessons, exams, cp_ledger, monthly_bonuses, participation, products, student_product_prices, purchases, quarter_titles, guides, backups, schema_meta`

핵심:
- `cp_ledger`: `amount, reason, occurred_date, available_date, status(pending|available), source_type, source_id` — 요구사항 6절의 장부 필드 모두 포함.
- `lessons`: 출결 + 단어시험 + 학습 기록을 한 레코드에. `attendance_only=1`이면 독립 출결.
- `exams.items_json`: 모의고사 1~45 문항별 O/X(미입력은 저장 안 함 → 분석 제외).

## 4. API 목록과 요청·응답 구조

전체 라우트 정의: [`server/http/api.js`](server/http/api.js)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스 체크 |
| GET | `/api/teachers` | 강사 목록 `{teachers:[{id,name,color,student_count}]}` |
| POST/PUT/DELETE | `/api/teachers[/:id]` | 강사 CRUD |
| GET/PUT | `/api/teachers/:id/rules` | 강사 공통 CP 규칙 |
| GET/POST/DELETE | `/api/teachers/:id/schools`, `/api/schools/:id` | 학교 |
| GET | `/api/teachers/:id/classes` | 분반 목록 |
| GET/PUT, GET `/draft` | `/api/teachers/:id/guide` | 의의·규칙 안내문 |
| GET/POST | `/api/students` | 목록(필터·정렬) / 생성 |
| GET/PUT/DELETE | `/api/students/:id` | 학생 CRUD |
| GET | `/api/students/:id/detail` | **상세 집계(학생 전환 시 단일 호출)** |
| GET | `/api/students/:id/deletion-impact` | 삭제 영향(연결 기록 수) |
| GET/PUT | `/api/students/:id/rules` | 학생 예외 규칙 |
| GET | `/api/students/:id/ledger` | CP 장부 |
| POST, DELETE | `/api/students/:id/manual-cp`, `/api/ledger/:id` | 수동 CP |
| GET/POST, PUT/DELETE | `/api/students/:id/lessons`, `/api/lessons/:id` | 수업 CRUD(+CP 재계산) |
| GET/POST, PUT/DELETE | `/api/students/:id/exams`, `/api/exams/:id` | 시험 CRUD |
| GET | `/api/students/:id/exam-analysis` | 시험 분석 |
| GET | `/api/students/:id/coach` | AI 코치 분석 |
| GET/POST | `/api/participation`, `/api/students/:id/participation` | 참여 리모콘 |
| GET/POST/PUT/DELETE | `/api/students/:id/bonuses[/:month]` | 월간 보너스 |
| 상점 | `/api/teachers/:id/products`, `/api/products/:id`, `/api/products/:id/end`, `/api/students/:id/products`, `/api/students/:sid/products/:pid/price`, `/api/upload` | 상품/이미지/가격 |
| 구매 | `/api/students/:id/purchase`, `/api/teachers/:id/purchases`, `/api/students/:id/inventory`, `/api/purchases/:id/state`, `/api/purchases/:id` | 구매/인벤토리 |
| 랭킹 | `/api/teachers/:id/ranking`, `/api/teachers/:id/quarter-titles[/confirm]` | 랭킹/분기 칭호 |
| 백업 | `/api/backup/export`, `/api/backup/compare`, `/api/backup/import`, `/api/backup/list` | 백업/복원 |

오류 응답: `{ error, code }` with HTTP 400(VALIDATION)/404(NOT_FOUND)/409(CONFLICT)/500(INTERNAL). JSON이 아닌 응답/타임아웃/404/500/504를 클라이언트가 구분 처리.

## 5. CP 계산 규칙

구현: [`server/lib/cp-engine.js`](server/lib/cp-engine.js) (순수 함수, 테스트 커버)

기본값(강사 규칙에서 변경 가능, 학생별 예외 가능):
- 통과 기준 **80점** / 기한 내 통과 **+10** / 만점 보너스 **+5**(만점 총 **+15**) / 기한 이후 통과 **-5** / 미응시 **-10** / 기타·없음 **0**
- 지각 인정 **5분** / 초과 **1분당 -1** / 월간 무지각 **+30** / 월간 단어 성실 **+30** / 참여 3스택 **+5**
- 개수제: 점수 = round((본 - 틀림) / 본 × 100). 점수제: 0~100 직접 입력.
- 이번 달 CP는 **대기 → 다음 달 1일 가용**. 수동 즉시 지급 가능. 구매 차감은 즉시 가용에서 차감.
- 수정·삭제 시 **이전 효과 제거 후 재계산**(트랜잭션).

## 6. 실제 실행 가능한 전체 소스코드

- 서버: `server/` (index, http/router, http/api, db/*, services/*, lib/*)
- 프런트: `public/` (index.html, styles.css, js/*, word-widget.html, remote.html)
- 모든 버튼은 실제 동작하며 데이터는 영구 저장됩니다.

## 7. 데이터베이스 초기화 및 마이그레이션

- 스키마는 `IF NOT EXISTS` 기반 idempotent. 버전은 `schema_meta`에 저장.
- 마이그레이션 러너: [`server/db/migrate.js`](server/db/migrate.js) (서버 시작 시 자동 실행).
- 명령:
  - `npm run db:init` — 스키마 적용
  - `npm run db:seed` — 샘플 데이터(기존 데이터 있으면 건너뜀)
  - `npm run db:reset` — DB 삭제 후 재생성 + 시드

## 8. 실행 · 빌드 · 배포 방법

**요구**: Node.js ≥ 22.5 (내장 `node:sqlite`). 설치/빌드 단계 없음(외부 의존성 0개).

### 바로 구동 (원클릭)
```bash
./run.sh
# 또는
npm start
```
→ `http://localhost:3000` 접속. **DB가 없으면 자동으로 생성 + 샘플 데이터를 시드**한 뒤 서버가 뜹니다.
샘플: 강사 2명(김영어/이보카), 학생 3명(박지민/최수아/정도윤), 지난달 수업·시험·보너스 기록 포함.

### 기타 명령 (로컬)
```bash
npm run serve        # 자동 시드 없이 서버만 기동
npm run dev          # 파일 변경 감지(개발)
npm run db:reset     # DB 삭제 후 재생성 + 시드
PORT=8080 npm start  # 포트 변경
```

### Cloudflare Workers + D1 배포
웹 대시보드 방식(비개발자용)은 **`CLOUDFLARE-배포안내.md`** 참고. CLI 방식:
```bash
npm i -g wrangler && wrangler login
npx wrangler d1 create cp-manager-db          # database_id를 wrangler.toml에 입력
npx wrangler d1 execute cp-manager-db --remote --file=server/db/schema.sql
npx wrangler deploy
```
- DB 계층은 async 어댑터(`server/db/adapter.js`)로 로컬(node:sqlite)과 D1을 동일 인터페이스로 통합
- Workers 진입점은 `worker.js`, 정적 자산은 `public/`가 `assets` 바인딩으로 서빙
- 이미지 업로드는 로컬=파일저장 / Workers=data URL 인라인 저장(추후 R2 연동 지점)

관리자 보호 활성화:
```bash
CP_ADMIN_KEY=비밀키 npm start    # 이후 API 호출 시 x-admin-key 헤더 필요
```

배포:
- 포트: `PORT` 환경변수. DB 경로: `CP_DB_PATH`.
- 서버리스(예: Cloudflare Workers + D1) 이식 시 `server/db/connection.js`의 쿼리 실행부를 D1 바인딩으로, `upload-service.js`를 R2로 교체하면 동일 스키마/로직 재사용 가능.

## 9. 테스트 코드

- 단위: [`tests/cp-engine.test.js`](tests/cp-engine.test.js) — CP 계산 14케이스
- 통합: [`tests/integration.test.js`](tests/integration.test.js) — 서비스/트랜잭션/재계산/구매/참여 11케이스
- E2E 스모크: [`scripts/smoke-test.js`](scripts/smoke-test.js) — 실행 중 서버 대상 32개 엔드포인트 흐름

```bash
npm test             # 25개 단위+통합 테스트
npm run smoke        # (서버 실행 중일 때) E2E 스모크 32개
```

## 10. 주요 기능 검수표

[`CHECKLIST.md`](CHECKLIST.md) 참조.

---

## 디렉터리 구조

```
cp-manager/
├─ server/
│  ├─ index.js                # HTTP 서버(정적+API, 오류 매핑, 관리자 보호)
│  ├─ http/{router,api}.js    # 라우터 + 라우트 정의
│  ├─ db/{connection,schema.sql,migrate}.js
│  ├─ lib/{time,cp-engine,validation,exam-types}.js
│  └─ services/*.js           # 도메인별 서비스(트랜잭션/CP 재계산)
├─ public/
│  ├─ index.html, styles.css
│  ├─ word-widget.html, remote.html   # 팝업 창
│  └─ js/ ...                 # SPA (바닐라 ES 모듈)
├─ scripts/{db-init,db-seed,db-reset,smoke-test}.js
├─ tests/*.test.js
├─ data/                      # SQLite 파일(gitignore)
└─ backups/                   # 백업 JSON(gitignore)
```
