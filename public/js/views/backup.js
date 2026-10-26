import { h, openModal, modalShell, toast, confirmDialog } from '../ui.js';
import { api } from '../api.js';

export function openBackup(teacher) {
  openModal((close) => {
    const scopeSel = selEl(teacher ? ['all|전체 데이터', `teacher|${teacher.name} 강사만`] : ['all|전체 데이터'], teacher ? 'teacher' : 'all');
    const fileInp = h('input', { type: 'file', accept: 'application/json,.json' });
    const info = h('div', { class: 'muted', style: { marginTop: '0.5rem' } });

    const doExport = async () => {
      try {
        const tid = scopeSel.value === 'teacher' && teacher ? teacher.id : null;
        const data = await api.get('/api/backup/export', { query: tid ? { teacher_id: tid } : {} });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `cp-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('백업 파일을 내보냈습니다.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };

    const doImport = async () => {
      const file = fileInp.files[0];
      if (!file) return toast('불러올 JSON 파일을 선택하세요.', 'error');
      let payload;
      try { payload = JSON.parse(await file.text()); }
      catch { return toast('JSON 파싱 실패: 올바른 백업 파일이 아닙니다.', 'error'); }
      if (!payload.tables) return toast('유효하지 않은 백업 파일입니다. (tables 없음)', 'error');

      const scope = scopeSel.value === 'teacher' && teacher ? 'teacher' : 'all';
      const teacherId = scope === 'teacher' ? teacher.id : null;

      // 비교
      let cmp;
      try { cmp = await api.post('/api/backup/compare', { payload, teacher_id: teacherId }); }
      catch (e) { return toast('비교 실패: ' + e.message, 'error'); }

      const diffLines = Object.entries(cmp.summary)
        .filter(([, v]) => v.diff !== 0)
        .map(([t, v]) => `· ${t}: 웹 ${v.web}건 / 파일 ${v.pc}건`)
        .join('\n') || '(건수 차이 없음, 내용은 다를 수 있음)';

      const ok = await confirmDialog(
        '불러온 데이터로 현재 웹 데이터를 덮어쓰시겠습니까?',
        {
          title: '데이터 복원 (덮어쓰기)',
          confirmText: '파일 기준으로 덮어쓰기',
          detail: `복원 전 현재 웹 데이터가 자동 백업됩니다.\n자동 병합은 하지 않으며, 선택한 쪽으로 완전히 덮어씁니다.\n\n[데이터 비교]\n${diffLines}`,
        }
      );
      if (!ok) return;

      try {
        const res = await api.post('/api/backup/import', { payload, confirm: true, scope, teacher_id: teacherId });
        toast(`복원 완료. 복원 전 백업: ${res.backupFile}`, 'success');
        setTimeout(() => location.reload(), 1200);
      } catch (e) { toast('복원 실패: ' + e.message, 'error'); }
    };

    return modalShell({
      title: '💾 백업 및 복원', close,
      body: h('div', {},
        h('div', { class: 'field' }, h('label', {}, '범위'), scopeSel),
        h('h4', {}, '내보내기'),
        h('p', { class: 'muted' }, '학생·수업·출결·시험·CP장부·보너스·규칙·상품·구매·인벤토리·참여 기록을 JSON으로 저장합니다.'),
        h('button', { class: 'btn', onClick: doExport }, '⬇ JSON 내보내기'),
        h('h4', { style: { marginTop: '1rem' } }, '불러오기 (복원)'),
        h('p', { class: 'muted' }, 'PC 프로그램에서 내보낸 JSON을 불러옵니다. 복원 전 현재 데이터를 자동 백업하고, 확인 후에만 덮어씁니다.'),
        fileInp,
        h('div', { style: { marginTop: '0.5rem' } }, h('button', { class: 'btn danger', onClick: doImport }, '⬆ 불러와서 덮어쓰기')),
        info),
      footer: [h('button', { class: 'btn secondary', onClick: close }, '닫기')],
    });
  });
}

function selEl(options, current) {
  const s = h('select');
  for (const opt of options) { const [v, l] = opt.split('|'); const o = h('option', { value: v }, l); if (v === current) o.selected = true; s.appendChild(o); }
  return s;
}
