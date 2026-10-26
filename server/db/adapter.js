// DB 어댑터: 로컬(node:sqlite, 동기)과 Cloudflare D1(비동기)을 동일한 async 인터페이스로 통합.
//
// 공통 인터페이스 (모두 Promise 반환):
//   db.run(sql, params)   -> { lastInsertRowid, changes }
//   db.get(sql, params)   -> row | undefined
//   db.all(sql, params)   -> row[]
//   db.exec(sql)          -> void   (여러 문장 스크립트; 세미콜론 분리 실행)
//   db.batch(statements)  -> 트랜잭션처럼 묶어 실행 ([{sql, params}] 또는 콜백)
//
// 바인딩 정규화: undefined -> null, boolean -> 1/0 (양쪽 공통).

function normParams(params) {
  if (params == null) return [];
  const arr = Array.isArray(params) ? params : [params];
  return arr.map((a) => {
    if (a === undefined) return null;
    if (typeof a === 'boolean') return a ? 1 : 0;
    return a;
  });
}

/** SQL 스크립트를 개별 문장으로 분리 (문자열/주석 내 세미콜론 보호) */
export function splitSqlStatements(sql) {
  const statements = [];
  let cur = '';
  let i = 0;
  let inLine = false, inBlock = false, inStr = false, strCh = '';
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; } cur += c; i++; continue; }
    if (inBlock) { cur += c; if (c === '*' && n === '/') { cur += n; i += 2; inBlock = false; continue; } i++; continue; }
    if (inStr) { cur += c; if (c === strCh) { inStr = false; } i++; continue; }
    if (c === '-' && n === '-') { inLine = true; cur += c; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; cur += c; i++; continue; }
    if (c === "'" || c === '"') { inStr = true; strCh = c; cur += c; i++; continue; }
    if (c === ';') { const t = cur.trim(); if (t) statements.push(t); cur = ''; i++; continue; }
    cur += c; i++;
  }
  const last = cur.trim();
  if (last) statements.push(last);
  return statements;
}

// ───────────────────────── 로컬 어댑터 (node:sqlite) ─────────────────────────
export function createLocalAdapter(sqliteDb) {
  const prep = (sql) => sqliteDb.prepare(sql);
  return {
    kind: 'local',
    async run(sql, params) {
      const info = prep(sql).run(...normParams(params));
      return { lastInsertRowid: Number(info.lastInsertRowid), changes: Number(info.changes) };
    },
    async get(sql, params) {
      return prep(sql).get(...normParams(params));
    },
    async all(sql, params) {
      return prep(sql).all(...normParams(params));
    },
    async exec(sql) {
      sqliteDb.exec(sql);
    },
    // 로컬은 실제 BEGIN/COMMIT 트랜잭션 사용
    async batch(fnOrStatements) {
      sqliteDb.exec('BEGIN');
      try {
        let result;
        if (typeof fnOrStatements === 'function') {
          result = await fnOrStatements();
        } else {
          result = [];
          for (const st of fnOrStatements) {
            result.push(prep(st.sql).run(...normParams(st.params)));
          }
        }
        sqliteDb.exec('COMMIT');
        return result;
      } catch (e) {
        try { sqliteDb.exec('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      }
    },
    _raw: sqliteDb,
  };
}

// ───────────────────────── D1 어댑터 (Cloudflare) ─────────────────────────
export function createD1Adapter(d1) {
  return {
    kind: 'd1',
    async run(sql, params) {
      const res = await d1.prepare(sql).bind(...normParams(params)).run();
      const meta = res.meta || {};
      return { lastInsertRowid: Number(meta.last_row_id || 0), changes: Number(meta.changes || 0) };
    },
    async get(sql, params) {
      const row = await d1.prepare(sql).bind(...normParams(params)).first();
      return row == null ? undefined : row;
    },
    async all(sql, params) {
      const res = await d1.prepare(sql).bind(...normParams(params)).all();
      return res.results || [];
    },
    async exec(sql) {
      // D1은 여러 문장을 batch로 실행. 문장 단위로 분리.
      const stmts = splitSqlStatements(sql).filter((s) => !/^PRAGMA/i.test(s)); // D1은 PRAGMA 대부분 미지원 → 무시
      if (stmts.length === 0) return;
      await d1.batch(stmts.map((s) => d1.prepare(s)));
    },
    // D1은 대화형 트랜잭션이 없으므로 batch()로 원자적 실행.
    // 콜백 형태는 D1에서 완전한 원자성을 보장하기 어려워, 명령 수집 방식만 지원.
    async batch(fnOrStatements) {
      if (typeof fnOrStatements === 'function') {
        // 로컬과 동일한 코드 경로를 쓰되, D1에서는 순차 실행(원자성은 best-effort).
        return await fnOrStatements();
      }
      const prepared = fnOrStatements.map((st) => d1.prepare(st.sql).bind(...normParams(st.params)));
      return await d1.batch(prepared);
    },
    _raw: d1,
  };
}
