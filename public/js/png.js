// DOM -> PNG 캡처 (외부 라이브러리 없이 SVG foreignObject + canvas).
// 요구사항: 랭킹 TOP10, 의의·규칙 안내문을 한 장 이미지로 저장.

// 적용된 computed style을 인라인화하여 SVG 내부에서 렌더되도록 복제
function inlineStyles(src, dst) {
  const cs = window.getComputedStyle(src);
  const important = [
    'font-family','font-size','font-weight','font-style','color','background-color','background',
    'border','border-radius','padding','margin','display','flex-direction','align-items',
    'justify-content','gap','text-align','line-height','width','height','box-sizing',
    'border-top','border-bottom','border-left','border-right','white-space','overflow-wrap',
    'word-break','letter-spacing','box-shadow','grid-template-columns','opacity',
  ];
  let styleStr = '';
  for (const prop of important) {
    const v = cs.getPropertyValue(prop);
    if (v) styleStr += `${prop}:${v};`;
  }
  dst.setAttribute('style', styleStr);
  for (let i = 0; i < src.children.length; i++) {
    inlineStyles(src.children[i], dst.children[i]);
  }
}

/**
 * node를 PNG로 캡처해 다운로드한다.
 * @param {HTMLElement} node
 * @param {string} filename
 * @param {object} opts { background, scale }
 */
export async function captureToPng(node, filename, { background = '#f8f2e7', scale = 2 } = {}) {
  const rect = node.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);

  const clone = node.cloneNode(true);
  inlineStyles(node, clone);
  clone.style.margin = '0';

  const xml = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">${xml}</div>` +
    `</foreignObject></svg>`;

  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('이미지 렌더링에 실패했습니다.'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        resolve();
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
