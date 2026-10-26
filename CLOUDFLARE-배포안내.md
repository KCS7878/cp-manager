# CP 매니저 — Cloudflare 무료 배포 안내 (쉬운 설명)

이 문서대로 하면 **"링크만 누르면 항상 최신"** 인 상태가 됩니다.
한 번만 세팅해두면, 그 뒤로는 제가 코드를 고칠 때마다 사이트가 자동으로 갱신됩니다.

> 💰 **비용: 무료.** 신용카드 등록도 필요 없습니다. (소규모 사용 기준)

---

## 큰 그림 (딱 2가지만 하시면 됩니다)

1. **GitHub에 코드 올리기** (웹에서 드래그&드롭)
2. **Cloudflare에 가입 → GitHub 연결 → 버튼 클릭**

나머지(코드·설정)는 전부 준비돼 있습니다.

---

## 1단계: GitHub에 코드 올리기 (웹 드래그&드롭)

> 지난번 "Kiro 앱 연결"은 필요 없습니다. GitHub 웹사이트에서 직접 올리면 됩니다.

1. 인터넷 브라우저에서 선생님의 저장소로 갑니다: **`github.com/KCS7878/cp-manager`**
2. 오른쪽 위 파일 탐색기에서 받은 **`cp-manager.zip`** 의 **압축을 먼저 푸세요.** (폴더가 생깁니다)
3. GitHub 저장소 화면에서 **`Add file`(파일 추가) → `Upload files`(파일 업로드)** 를 누릅니다.
4. 압축 푼 폴더 **안의 내용물 전체**를 드래그해서 올립니다.
   - ⚠️ 폴더 자체가 아니라 **폴더 안의 파일·하위폴더들**을 선택해서 올리세요.
5. 아래 **`Commit changes`(변경 저장)** 버튼을 누릅니다.

> 파일이 많아 한 번에 안 되면, `server` 폴더 따로, `public` 폴더 따로 나눠 올려도 됩니다. 막히면 저에게 말씀해 주세요.

---

## 2단계: Cloudflare 가입 + 연결

### 2-1. 가입
1. **`dash.cloudflare.com/sign-up`** 에서 이메일로 무료 가입 (카드 불필요)

### 2-2. 데이터베이스(D1) 만들기
1. 왼쪽 메뉴에서 **`Storage & Databases`(저장소) → `D1 SQL Database`** 로 이동
2. **`Create`(만들기)** → 이름에 **`cp-manager-db`** 입력 → 생성
3. 만들어진 DB를 열면 **`Database ID`** 라는 긴 문자열이 보입니다. 이걸 **복사**해 두세요.

### 2-3. 앱(Worker) 만들고 GitHub 연결
1. 왼쪽 메뉴 **`Compute (Workers)` → `Create`** → **`Import a repository`**(저장소 가져오기) 선택
2. GitHub 계정 연결을 허용하고, **`cp-manager`** 저장소를 고릅니다
3. 설정 화면에서:
   - **Build command(빌드 명령)**: 비워두거나 `echo skip`
   - 나머지는 기본값
4. **배포(Deploy)** 를 누릅니다

### 2-4. 데이터베이스 연결 (중요)
배포 후, 그 Worker 설정에서 D1을 연결합니다:
1. Worker → **`Settings`(설정) → `Bindings`(바인딩)** → **`Add` → `D1 database`**
2. **Variable name(변수 이름)**: **`DB`** (대문자, 정확히)
3. **D1 database**: 방금 만든 **`cp-manager-db`** 선택 → 저장
4. 변경 후 **다시 배포(Deploy)** 한 번 눌러주세요.

---

## 3단계: 완성! 🎉

이제 Cloudflare가 준 주소(예: `https://cp-manager.<계정>.workers.dev`)가 **선생님의 영구 링크**입니다.
- 이 링크를 **즐겨찾기** 해두고 누르기만 하면 됩니다.
- 집·학원 어디서든, 태블릿·폰에서도 같은 데이터로 열립니다.
- 데이터는 Cloudflare D1에 **영구 저장**되어 사라지지 않습니다.

---

## 앞으로 업데이트는?
제가 코드를 고쳐서 GitHub에 반영하면 **Cloudflare가 자동으로 새 버전을 배포**합니다.
→ 선생님은 **아무것도 안 하셔도** 링크를 새로고침하면 최신입니다.

(초기 GitHub 업로드만 수동이고, 그 뒤 연결이 되면 자동화됩니다. GitHub 연결까지 되면 제가 직접 반영할 수 있는 방법도 함께 안내드리겠습니다.)

---

## 참고: 기술팀/개발자용 (CLI로 할 경우)
터미널에 익숙하다면 아래로도 가능합니다:
```bash
npm i -g wrangler
wrangler login
npx wrangler d1 create cp-manager-db      # 출력된 database_id를 wrangler.toml에 붙여넣기
npx wrangler d1 execute cp-manager-db --remote --file=server/db/schema.sql
npx wrangler deploy
```
- `wrangler.toml` 의 `database_id` 를 2-2에서 복사한 값으로 교체해야 합니다.
- 로컬 미리보기: `npx wrangler dev`
