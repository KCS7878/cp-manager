// D1 어댑터를 모의 D1 객체(node:sqlite 백엔드)로 검증.
// 실제 Cloudflare D1의 바인딩 API 형태(prepare/bind/run/first/all/batch)를 흉내 내어,
// 어댑터가 올바른 결과(lastInsertRowid, rows 등)를 반환하는지 확인한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createD1Adapter } from '../server/db/adapter.js';

// node:sqlite를 백엔드로 쓰는 D1 호환 mock
function makeMockD1(sqlite) {
  return {
    prepare(sql) {
      let bound = [];
      const stmt = {
        bind(...args) { bound = args; return stmt; },
        async run() {
          const info = sqlite.prepare(sql).run(...bound);
          return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: Number(info.changes) } };
        },
        async first() {
          const row = sqlite.prepare(sql).get(...bound);
          return row === undefined ? null : row;
        },
        async all() {
          const results = sqlite.prepare(sql).all(...bound);
          return { success: true, results };
        },
      };
      return stmt;
    },
    async batch(statements) {
      // D1 batch: 각 prepared statement를 순차 실행하고 결과 배열 반환 (원자적)
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const st of statements) out.push(await st.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}

const tmpDb = path.join(os.tmpdir(), `cp-d1-${Date.now()}.db`);
let sqlite, db;

before(() => {
  sqlite = new DatabaseSync(tmpDb);
  sqlite.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, n INTEGER)');
  db = createD1Adapter(makeMockD1(sqlite));
});
after(() => {
  sqlite.close();
  for (const s of ['', '-wal', '-shm']) if (fs.existsSync(tmpDb + s)) fs.rmSync(tmpDb + s);
});

test('run()이 lastInsertRowid를 반환', async () => {
  const info = await db.run('INSERT INTO t (name, n) VALUES (?, ?)', ['a', 1]);
  assert.equal(info.lastInsertRowid, 1);
  const info2 = await db.run('INSERT INTO t (name, n) VALUES (?, ?)', ['b', 2]);
  assert.equal(info2.lastInsertRowid, 2);
});

test('get()이 단일 행 반환, 없으면 undefined', async () => {
  const row = await db.get('SELECT * FROM t WHERE name = ?', ['a']);
  assert.equal(row.n, 1);
  const none = await db.get('SELECT * FROM t WHERE name = ?', ['zzz']);
  assert.equal(none, undefined);
});

test('all()이 배열 반환', async () => {
  const rows = await db.all('SELECT * FROM t ORDER BY id', []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'a');
});

test('undefined/boolean 바인딩 정규화', async () => {
  const info = await db.run('INSERT INTO t (name, n) VALUES (?, ?)', [undefined, true]);
  const row = await db.get('SELECT * FROM t WHERE id = ?', [info.lastInsertRowid]);
  assert.equal(row.name, null); // undefined -> null
  assert.equal(row.n, 1);       // true -> 1
});

test('batch()로 묶은 쓰기가 모두 반영', async () => {
  const d1 = makeMockD1(sqlite);
  const res = await db.batch([
    { sql: 'INSERT INTO t (name, n) VALUES (?, ?)', params: ['c', 3] },
    { sql: 'INSERT INTO t (name, n) VALUES (?, ?)', params: ['d', 4] },
  ]);
  assert.equal(res.length, 2);
  const rows = await db.all('SELECT * FROM t WHERE name IN (?, ?)', ['c', 'd']);
  assert.equal(rows.length, 2);
});

test('exec()가 PRAGMA를 건너뛰고 여러 문장 실행', async () => {
  await db.exec('PRAGMA foreign_keys = ON; INSERT INTO t (name, n) VALUES (\'e\', 5);');
  const row = await db.get('SELECT * FROM t WHERE name = ?', ['e']);
  assert.equal(row.n, 5);
});
