// PNG 저장 유틸 (외부 라이브러리 없음).
// SVG foreignObject→canvas 방식은 브라우저 보안상 canvas를 "오염(tainted)"시켜
// toBlob/toDataURL이 막힌다. 그래서 Canvas 2D API로 직접 그려 안전하게 내보낸다.
// 한글 폰트는 페이지에 로드된 폰트 스택을 그대로 사용한다.

const FONT_STACK = "Pretendard, SUIT, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
const COLORS = {
  cream: '#f8f2e7', card: '#fffdf8', navy: '#203047', coral: '#ee735a',
  coralDark: '#d95b44', orange: '#e7a84d', sage: '#78977a', border: '#e5d8c4',
  gold: '#e6a700', silver: '#9aa5b1', bronze: '#b6794a', muted: '#6a7684',
};

function makeCanvas(w, h, scale, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'middle';
  return { canvas, ctx };
}

// 주어진 최대 폭을 넘으면 말줄임표로 자른다.
function truncate(ctx, text, maxW) {
  text = String(text ?? '');
  if (ctx.measureText(text).width <= maxW) return text;
  const ell = '…';
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ell).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ell;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function downloadCanvas(canvas, filename) {
  const blob = await new Promise((res, rej) => {
    try { canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG 생성 실패'))), 'image/png'); }
    catch (e) { rej(e); }
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * 랭킹 TOP N 카드를 PNG로 저장.
 * data: { title, subtitle, rows:[{rank,name,sub,cp,symbols:[{text,kind}]}] }
 */
export async function captureRanking(data, filename, { scale = 2 } = {}) {
  const W = 760;
  const padX = 28;
  const headerH = 92;
  const rowH = 60;
  const footerH = 36;
  const H = headerH + data.rows.length * rowH + footerH;

  const { canvas, ctx } = makeCanvas(W, H, scale, COLORS.cream);

  // 헤더
  ctx.fillStyle = COLORS.coral;
  roundRect(ctx, 0, 0, W, headerH, 0); ctx.fill();
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, COLORS.coral); grad.addColorStop(1, COLORS.orange);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = '#fff';
  ctx.font = `800 24px ${FONT_STACK}`;
  ctx.fillText('🏆 ' + data.title, padX, 36);
  if (data.subtitle) {
    ctx.font = `600 15px ${FONT_STACK}`;
    ctx.globalAlpha = 0.92;
    ctx.fillText(data.subtitle, padX, 66);
    ctx.globalAlpha = 1;
  }

  // 행
  let y = headerH;
  data.rows.forEach((r, i) => {
    // 카드 배경 (교차 음영)
    ctx.fillStyle = i % 2 === 0 ? COLORS.card : '#fbf5ea';
    ctx.fillRect(0, y, W, rowH);
    ctx.strokeStyle = COLORS.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padX, y + rowH - 0.5); ctx.lineTo(W - padX, y + rowH - 0.5); ctx.stroke();

    const cy = y + rowH / 2;
    // 순위
    const rankColor = r.rank === 1 ? COLORS.gold : r.rank === 2 ? COLORS.silver : r.rank === 3 ? COLORS.bronze : COLORS.coral;
    ctx.fillStyle = rankColor;
    ctx.font = `800 22px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(r.rank), padX + 18, cy);
    ctx.textAlign = 'left';

    // 이름 + 부가정보
    ctx.fillStyle = COLORS.navy;
    ctx.font = `700 17px ${FONT_STACK}`;
    const nameX = padX + 48;
    ctx.fillText(truncate(ctx, r.name, 230), nameX, cy - (r.sub ? 9 : 0));
    if (r.sub) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `500 12.5px ${FONT_STACK}`;
      ctx.fillText(truncate(ctx, r.sub, 300), nameX, cy + 12);
    }

    // CP (우측 정렬)
    ctx.fillStyle = COLORS.coralDark;
    ctx.font = `800 19px ${FONT_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${r.cp} CP`, W - padX, cy);
    ctx.textAlign = 'left';

    // 심볼 배지 (CP 왼쪽에, 충분한 간격)
    if (r.symbols && r.symbols.length) {
      const cpWidth = ctx.measureText(`${r.cp} CP`).width + 20;
      let bx = W - padX - cpWidth - 90; // CP와 충분히 떨어뜨림
      ctx.font = `700 11.5px ${FONT_STACK}`;
      // 오른쪽에서 왼쪽으로 쌓기
      let cursor = W - padX - cpWidth;
      for (let s = r.symbols.length - 1; s >= 0; s--) {
        const sym = r.symbols[s];
        const label = sym.text;
        const tw = ctx.measureText(label).width + 16;
        cursor -= tw + 8; // 배지 간 간격 8
        const bg = sym.kind === 'perfect' ? 'rgba(238,115,90,0.16)'
          : sym.kind === 'streak' ? 'rgba(120,151,122,0.2)'
          : sym.kind === 'title' ? '#ffe3a6' : '#f1e7d4';
        const fg = sym.kind === 'perfect' ? COLORS.coralDark
          : sym.kind === 'streak' ? '#4d6650'
          : sym.kind === 'title' ? '#5a4210' : '#7a5e1d';
        ctx.fillStyle = bg;
        roundRect(ctx, cursor, cy - 11, tw, 22, 11); ctx.fill();
        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.fillText(label, cursor + tw / 2, cy);
        ctx.textAlign = 'left';
      }
    }
    y += rowH;
  });

  // 푸터
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 12px ${FONT_STACK}`;
  ctx.fillText('CP 매니저 · ' + new Date().toLocaleDateString('ko-KR'), padX, y + footerH / 2);

  await downloadCanvas(canvas, filename);
}

/**
 * 긴 텍스트(의의·규칙 등)를 PNG로 저장. 마크다운 헤더(#, ##, 1.)를 간단히 스타일링.
 */
export async function captureText(title, text, filename, { scale = 2, width = 760 } = {}) {
  const W = width;
  const padX = 36;
  const contentW = W - padX * 2;
  const lineH = 26;

  // 미리 줄바꿈 계산을 위한 측정용 캔버스
  const meas = document.createElement('canvas').getContext('2d');
  const lines = [];
  const rawLines = String(text).split('\n');

  function pushWrapped(str, font, color, indent = 0) {
    meas.font = font;
    const maxW = contentW - indent;
    if (str.trim() === '') { lines.push({ text: '', font, color, indent, gap: 10 }); return; }
    const words = str.split(/(\s+)/);
    let cur = '';
    for (const w of words) {
      const test = cur + w;
      if (meas.measureText(test).width > maxW && cur) {
        lines.push({ text: cur, font, color, indent });
        cur = w.trimStart();
      } else cur = test;
    }
    if (cur) lines.push({ text: cur, font, color, indent });
  }

  for (const raw of rawLines) {
    const line = raw.replace(/\r$/, '');
    if (/^#\s+/.test(line)) pushWrapped(line.replace(/^#\s+/, ''), `800 22px ${FONT_STACK}`, COLORS.navy);
    else if (/^##\s+/.test(line)) pushWrapped(line.replace(/^##\s+/, ''), `700 18px ${FONT_STACK}`, COLORS.coralDark);
    else if (/^###\s+/.test(line)) pushWrapped(line.replace(/^###\s+/, ''), `700 15.5px ${FONT_STACK}`, COLORS.navy);
    else pushWrapped(line, `400 15px ${FONT_STACK}`, COLORS.navy, line.startsWith('-') || line.startsWith('·') ? 14 : 0);
  }

  const titleH = 64;
  const H = titleH + lines.length * lineH + 48;
  const { canvas, ctx } = makeCanvas(W, H, scale, COLORS.cream);

  // 카드 배경
  ctx.fillStyle = COLORS.card;
  roundRect(ctx, 12, 12, W - 24, H - 24, 16); ctx.fill();
  ctx.strokeStyle = COLORS.border; ctx.lineWidth = 1.5; ctx.stroke();

  // 타이틀 바
  const g = ctx.createLinearGradient(12, 12, W - 12, 12);
  g.addColorStop(0, COLORS.coral); g.addColorStop(1, COLORS.orange);
  ctx.fillStyle = g;
  roundRect(ctx, 12, 12, W - 24, 48, 16); ctx.fill();
  ctx.fillStyle = COLORS.card;
  ctx.fillRect(12, 44, W - 24, 16);
  ctx.fillStyle = '#fff';
  ctx.font = `800 20px ${FONT_STACK}`;
  ctx.fillText('📜 ' + title, padX, 36);

  // 본문
  let y = titleH + 16;
  for (const ln of lines) {
    ctx.font = ln.font;
    ctx.fillStyle = ln.color;
    ctx.fillText(ln.text, padX + (ln.indent || 0), y);
    y += lineH + (ln.gap || 0);
  }

  await downloadCanvas(canvas, filename);
}
