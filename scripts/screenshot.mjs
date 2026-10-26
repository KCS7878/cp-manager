// 무의존성 CDP 드라이버: headless-shell에 WebSocket으로 붙어 페이지를 캡처한다.
// 사용: node scripts/screenshot.mjs <devtoolsHttpBase> <url> <outPath> [width] [height] [waitMs] [clickSelector]
import fs from 'node:fs';
import crypto from 'node:crypto';
import net from 'node:net';

const [, , dtBase, url, outPath, wArg, hArg, waitArg, clickSel] = process.argv;
const width = Number(wArg || 1280);
const height = Number(hArg || 900);
const waitMs = Number(waitArg || 1500);

// --- 최소 WebSocket 클라이언트 (RFC6455, 마스킹된 텍스트 프레임) ---
function wsConnect(wsUrl) {
  const u = new URL(wsUrl);
  const port = Number(u.port || 80);
  const key = crypto.randomBytes(16).toString('base64');
  const sock = net.connect(port, u.hostname);
  const handlers = { message: [], open: [] };
  let buf = Buffer.alloc(0);
  let handshaked = false;

  sock.on('connect', () => {
    const req =
      `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
      `Host: ${u.host}\r\n` +
      `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`;
    sock.write(req);
  });

  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (!handshaked) {
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      handshaked = true;
      buf = buf.slice(idx + 4);
      handlers.open.forEach((f) => f());
    }
    // 프레임 파싱 (서버→클라이언트는 마스킹 없음)
    while (buf.length >= 2) {
      const b1 = buf[1];
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
      if (buf.length < offset + len) return;
      const payload = buf.slice(offset, offset + len);
      buf = buf.slice(offset + len);
      handlers.message.forEach((f) => f(payload.toString('utf8')));
    }
  });

  function sendText(str) {
    const payload = Buffer.from(str, 'utf8');
    const len = payload.length;
    let header;
    const mask = crypto.randomBytes(4);
    if (len < 126) header = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
    sock.write(Buffer.concat([header, mask, masked]));
  }
  return {
    on: (ev, f) => handlers[ev].push(f),
    send: sendText,
    close: () => sock.end(),
  };
}

async function main() {
  // 타겟 생성
  const ver = await (await fetch(`${dtBase}/json/version`)).json();
  const ws = wsConnect(ver.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  await new Promise((res) => ws.on('open', res));
  ws.on('message', (txt) => {
    const msg = JSON.parse(txt);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  });
  const cmd = (method, params = {}, sessionId) =>
    new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

  // 새 페이지 타겟
  const { result: tgt } = await cmd('Target.createTarget', { url: 'about:blank' });
  const { result: att } = await cmd('Target.attachToTarget', { targetId: tgt.targetId, flatten: true });
  const sid = att.sessionId;

  await cmd('Page.enable', {}, sid);
  await cmd('Runtime.enable', {}, sid);
  await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sid);

  await cmd('Page.navigate', { url }, sid);
  // load 대기
  await new Promise((r) => setTimeout(r, waitMs));

  if (clickSel) {
    await cmd('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(clickSel)})?.click()`, awaitPromise: true }, sid);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  // 진단: 주요 요소 존재 확인
  const diag = await cmd('Runtime.evaluate', {
    expression: `JSON.stringify({ title: document.title, teacherCards: document.querySelectorAll('.teacher-card').length, hasApp: !!document.getElementById('app'), bodyLen: document.body.innerText.length })`,
    returnByValue: true,
  }, sid);
  console.log('DIAG:', diag.result.result.value);

  const { result: shot } = await cmd('Page.captureScreenshot', { format: 'png' }, sid);
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log('SAVED:', outPath, fs.statSync(outPath).size, 'bytes');

  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e); process.exit(1); });
