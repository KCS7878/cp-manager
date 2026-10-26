// 수업 참여 리모콘 — 별도의 작은 팝업 창 (요구사항 11절).
export function openRemote(teacher) {
  const w = window.open(`/remote.html?teacher_id=${teacher.id}`, 'cp-remote', 'width=520,height=760,resizable=yes,scrollbars=yes');
  if (!w) alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.');
}
