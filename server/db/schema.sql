-- CP 매니저 데이터베이스 스키마
-- 모든 금액(CP)은 정수. 날짜는 'YYYY-MM-DD' 문자열, 타임스탬프는 'YYYY-MM-DD HH:MM:SS' (Asia/Seoul).

PRAGMA foreign_keys = ON;

-- 스키마 버전 (마이그레이션용)
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 강사
CREATE TABLE IF NOT EXISTS teachers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#ee735a',   -- 카드 강조색
  access_code TEXT,                     -- 선생님 접속 코드 (로그인 대용)
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_code ON teachers(access_code) WHERE access_code IS NOT NULL;

-- 강사별 학교 목록
CREATE TABLE IF NOT EXISTS schools (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'etc',   -- 'middle' | 'high' | 'etc'
  created_at  TEXT NOT NULL
);

-- 학생
CREATE TABLE IF NOT EXISTS students (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id      INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  school          TEXT,
  school_level    TEXT DEFAULT 'etc',        -- 'middle' | 'high' | 'etc'
  grade           TEXT,                      -- '중1'..'고3'
  class_name      TEXT,                      -- 분반명
  age             INTEGER,
  subject         TEXT DEFAULT '영어',
  mock_goal_type  TEXT DEFAULT 'undecided',  -- 'grade' | 'score' | 'undecided'
  mock_goal_value TEXT,                       -- 등급/점수 문자열
  exam_goal_type  TEXT DEFAULT 'undecided',  -- 'grade' | 'score' | 'undecided'
  exam_goal_value TEXT,
  word_input_mode TEXT DEFAULT 'count',      -- 'count'(개수제) | 'score'(점수제)
  access_code     TEXT,                      -- 학생 접속 코드 (읽기 전용 화면용)
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_students_teacher ON students(teacher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_code ON students(access_code) WHERE access_code IS NOT NULL;

-- 강사별 CP 규칙 (강사당 1행). 학생별 예외는 student_cp_rules.
CREATE TABLE IF NOT EXISTS cp_rules (
  teacher_id             INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
  word_pass_score        INTEGER NOT NULL DEFAULT 80,    -- 단어시험 통과 기준 점수
  pass_in_time_cp        INTEGER NOT NULL DEFAULT 10,    -- 기한 내 통과 +10
  perfect_bonus_cp       INTEGER NOT NULL DEFAULT 5,     -- 만점 추가 +5
  pass_late_cp           INTEGER NOT NULL DEFAULT -5,    -- 기한 이후 통과 -5
  no_show_cp             INTEGER NOT NULL DEFAULT -10,   -- 미응시 -10
  late_grace_min         INTEGER NOT NULL DEFAULT 5,     -- 지각 인정 기준(분)
  late_penalty_per_min   INTEGER NOT NULL DEFAULT 1,     -- 기준 초과 1분당 -1
  monthly_no_late_bonus  INTEGER NOT NULL DEFAULT 30,    -- 월간 무지각 보너스
  monthly_word_bonus     INTEGER NOT NULL DEFAULT 30,    -- 월간 단어시험 성실 보너스
  participation_stack3_cp INTEGER NOT NULL DEFAULT 5,    -- 참여 3스택 시 보너스
  -- 랭킹 심볼 토글 (기본 OFF)
  show_quarter_title     INTEGER NOT NULL DEFAULT 0,
  show_perfect_attend    INTEGER NOT NULL DEFAULT 0,
  show_day_streak        INTEGER NOT NULL DEFAULT 0,
  updated_at             TEXT NOT NULL
);

-- 학생별 예외 CP 규칙 (설정된 컬럼만 override; NULL이면 강사 규칙 사용)
CREATE TABLE IF NOT EXISTS student_cp_rules (
  student_id             INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  word_pass_score        INTEGER,
  pass_in_time_cp        INTEGER,
  perfect_bonus_cp       INTEGER,
  pass_late_cp           INTEGER,
  no_show_cp             INTEGER,
  late_grace_min         INTEGER,
  late_penalty_per_min   INTEGER,
  monthly_no_late_bonus  INTEGER,
  monthly_word_bonus     INTEGER,
  updated_at             TEXT NOT NULL
);

-- 수업 기록 (출결/단어시험을 한 레코드에 통합; 독립 출결은 attendance_only=1)
CREATE TABLE IF NOT EXISTS lessons (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_date       TEXT NOT NULL,            -- 'YYYY-MM-DD'
  -- 출결
  attendance        TEXT NOT NULL DEFAULT 'present', -- 'present'|'late'|'absent'
  late_minutes      INTEGER NOT NULL DEFAULT 0,
  -- 단어시험
  word_status       TEXT NOT NULL DEFAULT 'none',    -- 'none'|'taken'|'noshow'|'etc'
  word_etc_reason   TEXT,                     -- word_status='etc'일 때 필수
  word_range        TEXT,                     -- 자유 텍스트
  word_seen         INTEGER,                  -- 본 단어 수
  word_wrong        INTEGER,                  -- 틀린 단어 수 (개수제)
  word_score        INTEGER,                  -- 0-100 점수 (점수제 또는 개수제 환산)
  deadline_met      INTEGER NOT NULL DEFAULT 1,  -- 마감 기한 준수 여부 (1/0)
  -- 학습 기록
  progress_today    TEXT,                     -- 이번 수업 진도
  next_direction    TEXT,                     -- 다음 수업 방향
  weakness          TEXT,                     -- 확인된 약점
  homework          TEXT,                     -- 숙제
  progress_rate     INTEGER,                  -- 진도율 0-100
  attendance_only   INTEGER NOT NULL DEFAULT 0,  -- 1이면 독립 출결 기록
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lessons_student ON lessons(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(student_id, lesson_date);

-- 내신·모의고사 기록
CREATE TABLE IF NOT EXISTS exams (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_type   TEXT NOT NULL,              -- 'school'(내신) | 'mock'(모의고사)
  exam_name   TEXT NOT NULL,
  exam_date   TEXT NOT NULL,
  score       INTEGER,
  grade       TEXT,                       -- 등급 (선택)
  strengths   TEXT,                       -- 잘한 점
  weakness    TEXT,                       -- 약점
  feedback    TEXT,
  -- 모의고사 문항별 결과 JSON: { "1":"o"|"x"|null, ... "45": ... , "typeMap": {...} }
  items_json  TEXT,
  status        TEXT NOT NULL DEFAULT 'confirmed',   -- 'confirmed' | 'pending'(학생 제출, 승인 대기)
  submitted_by  TEXT NOT NULL DEFAULT 'teacher',     -- 'teacher' | 'student'
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_student ON exams(student_id);

-- CP 장부 (모든 CP 증감의 원장)
CREATE TABLE IF NOT EXISTS cp_ledger (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,         -- 양수=지급, 음수=차감
  reason         TEXT NOT NULL,            -- 사유
  occurred_date  TEXT NOT NULL,            -- 발생일 'YYYY-MM-DD'
  available_date TEXT NOT NULL,            -- 사용 가능일 'YYYY-MM-DD'
  status         TEXT NOT NULL,            -- 'pending'(대기) | 'available'(가용)
  source_type    TEXT NOT NULL,            -- 'lesson'|'participation'|'monthly_bonus'|'manual'|'purchase'|'exam'
  source_id      INTEGER,                  -- 연결된 원본 기록 ID
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_student ON cp_ledger(student_id);
CREATE INDEX IF NOT EXISTS idx_ledger_source ON cp_ledger(source_type, source_id);

-- 월간 보너스 (자동 계산 결과 저장; 관리자 수동 수정 가능)
CREATE TABLE IF NOT EXISTS monthly_bonuses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month_key     TEXT NOT NULL,             -- 'YYYY-MM'
  no_late_bonus INTEGER NOT NULL DEFAULT 0,
  word_bonus    INTEGER NOT NULL DEFAULT 0,
  manual_adjust INTEGER NOT NULL DEFAULT 0, -- 관리자 수동 조정
  ledger_id     INTEGER,                   -- 연결된 장부 ID
  computed_at   TEXT NOT NULL,
  UNIQUE(student_id, month_key)
);

-- 수업 참여 기록 (리모콘)
CREATE TABLE IF NOT EXISTS participation (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_date TEXT NOT NULL,
  stack       INTEGER NOT NULL DEFAULT 0,  -- 해당 수업일 참여 횟수(0-N)
  bonus_given INTEGER NOT NULL DEFAULT 0,  -- 3스택 보너스 지급했는지
  ledger_id   INTEGER,
  updated_at  TEXT NOT NULL,
  UNIQUE(student_id, lesson_date)
);

-- 상품
CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id   INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  base_cp      INTEGER NOT NULL DEFAULT 0,  -- 기본 필요 CP
  price_krw    INTEGER,                     -- 원화 가격
  image_url    TEXT,                        -- 상품 이미지 경로
  status       TEXT NOT NULL DEFAULT 'active', -- 'active'|'ended'(종료)
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_teacher ON products(teacher_id);

-- 학생별 상품 가격 (override)
CREATE TABLE IF NOT EXISTS student_product_prices (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cp_price   INTEGER NOT NULL,
  PRIMARY KEY (student_id, product_id)
);

-- 구매내역 + 인벤토리 (한 테이블로 구매/보유/사용 상태 관리)
CREATE TABLE IF NOT EXISTS purchases (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name   TEXT NOT NULL,            -- 구매 시점 상품명 스냅샷
  cp_spent       INTEGER NOT NULL,         -- 사용한 CP
  purchased_at   TEXT NOT NULL,            -- 구매일시
  inventory_state TEXT NOT NULL DEFAULT 'owned', -- 'owned'(보유)|'used'(사용완료)
  used_at        TEXT,                     -- 사용일
  ledger_id      INTEGER,                  -- 차감 장부 ID
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchases_student ON purchases(student_id);

-- 분기 칭호 (확정 저장; 과거 수정에도 불변)
CREATE TABLE IF NOT EXISTS quarter_titles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  quarter_key TEXT NOT NULL,               -- 적용 분기 'YYYY-Q1'
  rank        INTEGER NOT NULL,            -- 1|2|3
  student_id  INTEGER REFERENCES students(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,              -- 스냅샷
  title       TEXT NOT NULL,               -- 'King of English' 등
  confirmed_at TEXT NOT NULL,
  UNIQUE(teacher_id, quarter_key, rank)
);

-- 의의 및 규칙 안내문 (강사당 1행)
CREATE TABLE IF NOT EXISTS guides (
  teacher_id INTEGER PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',     -- 최대 12000자
  updated_at TEXT NOT NULL
);

-- 백업 정보
CREATE TABLE IF NOT EXISTS backups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER,
  kind       TEXT NOT NULL,                -- 'manual'|'auto_before_import'
  filename   TEXT NOT NULL,
  created_at TEXT NOT NULL
);
