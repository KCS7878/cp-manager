// 렌더된 페이지의 실제 텍스트(한글 포함)를 추출해 출력한다. CDP 사용.
import crypto from 'node:crypto';
import net from 'node:net';
const [, , dtBase, url, clickSel] = process.argv;

function wsConnect(wsUrl) {
  const u = new URL(wsUrl); const sock = net.connect(Number(u.port), u.hostname);
  const H = { message: [], open: [] }; let buf = Buffer.alloc(0); let hs = false;
  sock.on('connect', () => sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (!hs) { const i = buf.indexOf('\r\n\r\n'); if (i === -1) return; hs = true; buf = buf.slice(i + 4); H.open.forEach((f) => f()); }
    while (buf.length >= 2) {
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const p = buf.slice(off, off + len); buf = buf.slice(off + len); H.message.forEach((f) => f(p.toString('utf8')));
    }
  });
  const send = (s) => {
    const pl = Buffer.from(s, 'utf8'), len = pl.length, mask = crypto.randomBytes(4); let hdr;
    if (len < 126) hdr = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x81; hdr[1] = 0xfe; hdr.writeUInt16BE(len, 2); }
    else { hdr = Buffer.alloc(10); hdr[0] = 0x81; hdr[1] = 0xff; hdr.writeBigUInt64BE(BigInt(len), 2); }
    const m = Buffer.alloc(len); for (let i = 0; i < len; i++) m[i] = pl[i] ^ mask[i % 4];
    sock.write(Buffer.concat([hdr, mask, m]));
  };
  return { on: (e, f) => H[e].push(f), send };
}

async function main() {
  const ver = await (await fetch(`${dtBase}/json/version`)).json();
  const ws = wsConnect(ver.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  await new Promise((r) => ws.on('open', r));
  ws.on('message', (t) => { const m = JSON.parse(t); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cmd = (method, params = {}, sid) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId: sid })); });
  const { result: tgt } = await cmd('Target.createTarget', { url: 'about:blank' });
  const { result: att } = await cmd('Target.attachToTarget', { targetId: tgt.targetId, flatten: true });
  const sid = att.sessionId;
  await cmd('Page.enable', {}, sid); await cmd('Runtime.enable', {}, sid);
  await cmd('Page.navigate', { url }, sid);
  await new Promise((r) => setTimeout(r, 2200));
  if (clickSel) { await cmd('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(clickSel)})?.click()` }, sid); await new Promise((r) => setTimeout(r, 2200)); }
  const r = await cmd('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true }, sid);
  console.log(r.result.result.value);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
