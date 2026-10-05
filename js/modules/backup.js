// Backup & Restore (بیک اپ): one file with all your data; keep a copy on WhatsApp / Google Drive.
import * as UI from '../core/ui.js';
import { esc, fmtDateTime, downloadFile } from '../core/utils.js';
import { pref } from '../core/settings.js';
import { t } from '../core/i18n.js';
import * as Auth from '../services/auth.js';
import * as Backup from '../services/backup.js';

const $ = window.jQuery;

export async function downloadBackup() {
  const b = await UI.withLoading(() => Backup.createBackup(), t('bk.preparing'));
  const stamp = b.createdAt.replace(/[:.]/g, '-').slice(0, 19);
  downloadFile(`doodhwala-backup-${stamp}.json`, JSON.stringify(b), 'application/json');
  pref.set('lastBackup', Date.now());
  return b;
}

export default {
  async render(el) {
    const $el = $(el);
    const canRestore = Auth.can('backup.restore');
    const last = pref.get('lastBackup');
    $el.html(`<div class="page-header"><h1 class="dup">${esc(t('nav.backup'))}</h1></div>
      <div class="card p-3 mb-3"><h2 class="h5 fw-bold"><i class="bi bi-cloud-arrow-down-fill text-primary me-2"></i>${esc(t('bk.export'))}</h2>
        <p class="text-body-secondary">${esc(t('bk.exportHelp'))}</p>
        <div class="mb-3">${esc(t('bk.last'))}: <b class="last">${last ? esc(fmtDateTime(new Date(last).toISOString())) : esc(t('bk.never'))}</b></div>
        <button class="btn btn-primary btn-lg btn-export"><i class="bi bi-download"></i>${esc(t('bk.download'))}</button></div>
      <div class="card p-3"><h2 class="h5 fw-bold"><i class="bi bi-cloud-arrow-up-fill text-primary me-2"></i>${esc(t('bk.restore'))}</h2>
        ${canRestore ? `<p class="text-body-secondary">${esc(t('bk.restoreHelp'))}</p><input type="file" accept="application/json,.json" class="form-control file"><div class="preview mt-3"></div>` : `<div class="alert alert-secondary">${esc(t('err.noperm'))}</div>`}</div>`);
    $el.on('click', '.btn-export', async () => {
      try { const b = await downloadBackup(); UI.toast(t('bk.done')); $el.find('.last').text(fmtDateTime(b.createdAt)); } catch (e) { UI.toastError(e); }
    });
    let obj = null;
    $el.on('change', '.file', async function () {
      const f = this.files[0];
      const $p = $el.find('.preview').html(UI.spinner());
      obj = null;
      if (!f) return $p.empty();
      try {
        let parsed;
        try { parsed = JSON.parse(await f.text()); } catch { throw new Error(t('bk.badFile')); }
        const v = Backup.validateBackup(parsed);
        const sumOk = v.ok ? await Backup.verifyChecksum(parsed) : null;
        if (sumOk === false) v.errors.push(t('bk.checksum'));
        const ok = v.ok && sumOk !== false;
        const c = v.counts || {};
        $p.html(`<div class="alert ${ok ? 'alert-success' : 'alert-danger'} py-2">${ok ? `<i class="bi bi-check-circle-fill me-1"></i>${esc(t('bk.valid'))}` : `<i class="bi bi-x-octagon-fill me-1"></i>${esc(t('bk.invalid'))}`}${v.errors.map((e) => `<div class="small">• ${esc(e)}</div>`).join('')}</div>
          ${v.counts ? `<div class="mb-2">${esc(t('bk.created'))}: <b>${esc(fmtDateTime(v.createdAt))}</b></div><div class="d-flex flex-wrap gap-2 mb-3"><span class="chip">${esc(t('nav.customers'))}: ${c.customers || 0}</span><span class="chip">${esc(t('nav.products'))}: ${c.products || 0}</span><span class="chip">${esc(t('bk.deliveries'))}: ${c.deliveries || 0}</span><span class="chip">${esc(t('bk.sales'))}: ${c.sales || 0}</span></div>` : ''}
          ${ok ? `<div class="form-check mb-3 fs-6"><input class="form-check-input" type="checkbox" id="safety" checked><label class="form-check-label" for="safety">${esc(t('bk.safety'))}</label></div>
            <div class="d-grid gap-2"><button class="btn btn-primary btn-lg btn-merge"><i class="bi bi-intersect"></i>${esc(t('bk.merge'))}</button><button class="btn btn-danger btn-lg btn-replace"><i class="bi bi-arrow-repeat"></i>${esc(t('bk.replace'))}</button></div>` : ''}`);
        if (ok) obj = parsed;
      } catch (e) { $p.html(UI.errorState(e)); }
    });
    const doRestore = async (mode) => {
      if (!obj) return;
      const replace = mode === 'replace';
      let typed = '';
      const ask = UI.confirmDialog(replace ? `<p>${esc(t('bk.replaceWarn'))}</p><input class="form-control confirm-text text-center" placeholder="REPLACE" dir="ltr">` : `<p>${esc(t('bk.mergeAsk'))}</p>`,
        { html: true, okLabel: t(replace ? 'bk.replace' : 'bk.merge'), okClass: replace ? 'btn-danger' : 'btn-primary', title: t(replace ? 'bk.replace' : 'bk.merge') });
      $(document).on('input.confirmtext', '.confirm-text', function () { typed = this.value; });
      const ok = await ask;
      $(document).off('input.confirmtext');
      if (!ok) return;
      if (replace && typed.trim().toUpperCase() !== 'REPLACE') { UI.toast(t('bk.cancelled'), 'warning'); return; }
      try {
        if ($el.find('#safety').prop('checked')) await downloadBackup();
        const r = await UI.withLoading(() => Backup.restore(obj, mode), t('bk.restoring'));
        UI.toast(replace ? t('bk.restored') : t('bk.merged', { a: r.added, u: r.updated }));
        location.hash = '#/home';
      } catch (e) { UI.toastError(e); }
    };
    $el.on('click', '.btn-merge', () => doRestore('merge'));
    $el.on('click', '.btn-replace', () => doRestore('replace'));
  },
};
