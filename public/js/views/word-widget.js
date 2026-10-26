// 단어 점수 간편 입력기 — 별도의 작은 팝업 창으로 실행 (요구사항 7절).
export function openWordWidget() {
  const w = window.open('/word-widget.html', 'cp-word-widget', 'width=440,height=720,resizable=yes,scrollbars=yes');
  if (!w) alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.');
}
