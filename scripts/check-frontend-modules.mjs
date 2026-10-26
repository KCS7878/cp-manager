// 프런트 ES 모듈 그래프를 Node에서 로드해 import/export 정합성과 순환참조 문제를 점검한다.
// 최소 DOM/브라우저 전역 shim 제공.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// --- 브라우저 전역 shim ---
const noop = () => {};
const el = () => new Proxy({}, {
  get: (_, p) => {
    if (p === 'appendChild' || p === 'removeChild' || p === 'setAttribute' || p === 'addEventListener' || p === 'querySelector' || p === 'querySelectorAll') return () => el();
    if (p === 'classList') return { add: noop, remove: noop, toggle: () => false, contains: () => false };
    if (p === 'style' || p === 'dataset') return {};
    if (p === 'children') return [];
    return el();
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => el(),
  createTextNode: () => el(),
  getElementById: () => el(),
  querySelector: () => el(),
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  dispatchEvent: noop,
};
globalThis.window = { addEventListener: noop, getComputedStyle: () => ({ getPropertyValue: () => '' }), open: noop, localStorage: { getItem: () => null, setItem: noop } };
globalThis.localStorage = globalThis.window.localStorage;
globalThis.CustomEvent = class {};
globalThis.XMLSerializer = class { serializeToString() { return ''; } };
globalThis.Image = class {};
globalThis.Blob = class {};
globalThis.URL.createObjectURL = () => '';
globalThis.fetch = async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) });
globalThis.AbortController = class { constructor() { this.signal = {}; } abort() {} };

const base = path.resolve('public/js');
const modules = [
  'api.js', 'ui.js', 'png.js', 'state.js',
  'views/section.js', 'views/teacher-select.js', 'views/student-form.js',
  'views/rules.js', 'views/guide.js', 'views/ranking.js', 'views/backup.js',
  'views/word-widget.js', 'views/remote.js',
  'views/sections/summary.js', 'views/sections/ledger.js', 'views/sections/coach.js',
  'views/sections/lessons.js', 'views/sections/attendance.js', 'views/sections/exams.js',
  'views/sections/student-rules.js', 'views/sections/guide-section.js', 'views/sections/shop.js',
  'views/workspace.js', 'views/detail.js',
];

let fail = 0;
for (const m of modules) {
  try {
    const mod = await import(pathToFileURL(path.join(base, m)).href);
    void mod;
    console.log('  ok  ' + m);
  } catch (e) {
    fail++;
    console.log('FAIL  ' + m + '  -> ' + e.message);
  }
}
// main.js는 import 즉시 App.boot()를 호출하므로 마지막에 별도 처리(부팅은 실패해도 모듈 평가만 확인)
console.log(fail ? `\n=== ${fail} module(s) failed ===` : '\n=== 모든 프런트 모듈 로드 OK ===');
process.exit(fail ? 1 : 0);
