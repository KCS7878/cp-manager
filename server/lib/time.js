// Asia/Seoul 시간 유틸리티.
// 서울은 DST가 없으므로 UTC+9 고정 오프셋으로 안전하게 계산한다.
// 날짜 문자열은 모두 'YYYY-MM-DD' (서울 기준 로컬 날짜)로 다룬다.

const SEOUL_OFFSET_MIN = 9 * 60; // UTC+9

/** 현재 서울 시각의 Date 파트들을 반환 */
export function seoulNow() {
  return seoulParts(new Date());
}

/** JS Date -> 서울 기준 연/월/일/시/분/초 */
export function seoulParts(date) {
  const utcMs = date.getTime();
  const seoulMs = utcMs + SEOUL_OFFSET_MIN * 60 * 1000;
  const d = new Date(seoulMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1, // 1-12
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 현재 서울 날짜 'YYYY-MM-DD' */
export function todaySeoul() {
  const p = seoulNow();
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** 현재 서울 시각 ISO 유사 문자열 (장부 기록용 타임스탬프) */
export function nowSeoulStamp() {
  const p = seoulNow();
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/** 'YYYY-MM-DD' -> 'YYYY-MM' 월 키 */
export function monthKeyOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

/** 현재 서울 월 키 'YYYY-MM' */
export function currentMonthKey() {
  const p = seoulNow();
  return `${p.year}-${pad2(p.month)}`;
}

/** 'YYYY-MM' -> 다음 달 1일 'YYYY-MM-DD' (대기 CP의 사용 가능일 계산용) */
export function firstDayOfNextMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  let ny = y;
  let nm = m + 1;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  return `${ny}-${pad2(nm)}-01`;
}

/** 어떤 발생월(monthKey)의 CP가 사용 가능해지는 날짜 */
export function availableDateFor(dateStr) {
  return firstDayOfNextMonth(monthKeyOf(dateStr));
}

/** 'YYYY-MM-DD' <= 'YYYY-MM-DD' 비교 (문자열 사전순 == 날짜순) */
export function dateLte(a, b) {
  return a <= b;
}

/** 직전 월 키 */
export function prevMonthKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  let py = y;
  let pm = m - 1;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  return `${py}-${pad2(pm)}`;
}

/**
 * 'YYYY-MM-DD' -> 분기 키 'YYYY-Q1'..'YYYY-Q4'
 */
export function quarterKeyOf(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

/** 현재 서울 분기 키 */
export function currentQuarterKey() {
  return quarterKeyOf(todaySeoul());
}

/** 직전 분기 키 */
export function prevQuarterKey(quarterKey) {
  const [y, q] = quarterKey.split('-Q').map(Number);
  let py = y;
  let pq = q - 1;
  if (pq < 1) {
    pq = 4;
    py -= 1;
  }
  return `${py}-Q${pq}`;
}

/** 분기 키 -> 시작/종료 날짜 (inclusive) */
export function quarterRange(quarterKey) {
  const [y, q] = quarterKey.split('-Q').map(Number);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const start = `${y}-${pad2(startMonth)}-01`;
  const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
  const end = `${y}-${pad2(endMonth)}-${pad2(lastDay)}`;
  return { start, end };
}

/** 월 키 -> 시작/종료 날짜 (inclusive) */
export function monthRange(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${pad2(lastDay)}` };
}

/** 완료된 월인지 (현재 서울 월보다 이전인지) */
export function isCompletedMonth(monthKey) {
  return monthKey < currentMonthKey();
}
