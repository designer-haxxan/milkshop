// Settings (سیٹنگ): language, shop details, printer, account.
import { CONFIG } from '../config.js';
import * as UI from '../core/ui.js';
import { esc, fmtDateTime } from '../core/utils.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { t, lang, setLang } from '../core/i18n.js';
import * as Auth from '../services/auth.js';
import * as Posting from '../services/posting.js';
import * as Printer from '../printer/printer.js';

const $ = window.jQuery;

const section = (title, icon, body) => `<div class="card mb-3"><div class="card-body"><h2 class="h5 mb-3 fw-bold"><i class="bi bi-${icon} me-2 text-primary"></i>${esc(title)}</h2>${body}</div></div>`;

export default {
  async render(el) {
    const $el = $(el);
    const s = getSettings();
    const u = Auth.user();
    const cap = Printer.capabilities();
    $el.html(`<div class="page-header"><h1 class="dup">${esc(t('nav.settings'))}</h1></div>
    <div class="row g-3"><div class="col-lg-6">
      ${section(t('set.language'), 'translate', `<div class="seg" id="lg"><button data-l="ur" class="${lang() === 'ur' ? 'active' : ''}">اردو</button><button data-l="en" class="${lang() === 'en' ? 'active' : ''}">English</button></div>`)}
      ${section(t('set.shop'), 'shop', `<form class="f-business">
        <div class="mb-3"><label class="form-label">${esc(t('setup.shopname'))}</label><input name="name" class="form-control" value="${esc(s.business.name)}"></div>
        <div class="mb-3"><label class="form-label">${esc(t('cu.address'))}</label><input name="address" class="form-control" value="${esc(s.business.address)}"></div>
        <div class="mb-3"><label class="form-label">${esc(t('set.phone'))}</label><input name="phone" class="form-control" inputmode="tel" dir="ltr" value="${esc(s.business.phone)}"></div>
        <div class="mb-3"><label class="form-label">${esc(t('set.footer'))}</label><input name="footer" class="form-control" value="${esc(s.business.footer)}"></div>
        <button class="btn btn-success btn-lg w-100"><i class="bi bi-check-lg"></i>${esc(t('act.save'))}</button></form>`)}
      ${section(t('set.look'), 'palette', `<div class="seg" id="th"><button data-v="light" class="${s.theme === 'light' ? 'active' : ''}"><i class="bi bi-sun-fill"></i>${esc(t('set.light'))}</button><button data-v="dark" class="${s.theme === 'dark' ? 'active' : ''}"><i class="bi bi-moon-fill"></i>${esc(t('set.dark'))}</button></div>`)}
    </div><div class="col-lg-6">
      ${section(t('set.printer'), 'printer', `
        <form class="f-printer">
          <div class="mb-3"><label class="form-label">${esc(t('set.method'))}</label><select name="method" class="form-select">
            <option value="browser" ${s.printer.method === 'browser' ? 'selected' : ''}>${esc(t('set.m.browser'))}</option>
            <option value="bluetooth" ${s.printer.method === 'bluetooth' ? 'selected' : ''} ${cap.webBluetooth ? '' : 'disabled'}>${esc(t('set.m.bt'))}</option>
            <option value="rawbt" ${s.printer.method === 'rawbt' ? 'selected' : ''}>${esc(t('set.m.rawbt'))}</option></select></div>
          <div class="row g-3 mb-3"><div class="col-6"><label class="form-label">${esc(t('set.width'))}</label><select name="width" class="form-select"><option value="58" ${s.printer.width == 58 ? 'selected' : ''}>58 mm</option><option value="80" ${s.printer.width == 80 ? 'selected' : ''}>80 mm</option></select></div>
            <div class="col-6"><label class="form-label">${esc(t('set.copies'))}</label><input name="copies" type="number" min="1" max="5" class="form-control" value="${s.printer.copies || 1}"></div></div>
        </form>
        <div class="bt-box mb-3 ${s.printer.method === 'bluetooth' ? '' : 'd-none'}"><div class="d-flex align-items-center gap-2 mb-2"><i class="bi bi-bluetooth fs-4"></i><span class="bt-status flex-grow-1"></span></div>
          <div class="d-flex gap-2"><button class="btn btn-outline-primary flex-fill btn-bt-connect">${esc(t('set.connect'))}</button><button class="btn btn-light btn-bt-disconnect">${esc(t('set.disconnect'))}</button></div></div>
        <div class="small text-body-secondary mb-3 ${cap.webBluetooth ? 'd-none' : ''}">${esc(cap.note)}</div>
        <button class="btn btn-light w-100 btn-test"><i class="bi bi-printer-fill"></i>${esc(t('set.test'))}</button>`)}
      ${section(t('set.account'), 'person-circle', `<div class="fw-bold fs-5 mb-1">${esc(u.username)}</div>
        <div class="small mb-1">${esc(t('set.until'))}: <b>${esc(fmtDateTime(new Date(Auth.expiresAt()).toISOString()))}</b></div>
        <div class="small text-body-secondary">${esc(t('set.support', { phone: CONFIG.SUPPORT_PHONE }))}</div>
        <div class="d-grid gap-2 mt-3"><a class="btn btn-light" href="#/backup"><i class="bi bi-cloud-arrow-down-fill text-primary"></i>${esc(t('nav.backup'))}</a>
        <button class="btn btn-light btn-install d-none"><i class="bi bi-download"></i>${esc(t('app.install'))}</button>
        <button class="btn btn-light btn-integrity"><i class="bi bi-shield-check"></i>${esc(t('set.check'))}</button></div>
        <div class="small text-body-secondary mt-3">${esc(t('app.name'))} · v${esc(CONFIG.APP_VERSION)}</div>`)}
    </div></div>`);

    $el.on('click', '#lg [data-l]', function () { setLang(this.dataset.l); });
    $el.on('click', '#th [data-v]', function () { saveSettings({ theme: this.dataset.v }); $el.find('#th button').removeClass('active'); $(this).addClass('active'); });
    $el.on('submit', '.f-business', (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target).entries());
      if (!v.name.trim()) return UI.toast(t('set.nameReq'), 'warning');
      saveSettings({ business: { ...getSettings().business, name: v.name.trim(), address: v.address.trim(), phone: v.phone.trim(), footer: v.footer.trim() } });
      UI.toast(t('saved'));
    });
    const btStatus = () => $el.find('.bt-status').text(Printer.isConnected() ? `${t('set.connected')}: ${Printer.connectedName()}` : t('set.notConnected'));
    btStatus();
    const onPrinter = () => btStatus();
    document.addEventListener('printer:changed', onPrinter);
    this._off = () => document.removeEventListener('printer:changed', onPrinter);
    $el.on('change', '.f-printer', (e) => {
      const f = e.currentTarget;
      saveSettings({ printer: { method: f.method.value, width: Number(f.width.value), copies: Math.max(1, Math.min(5, parseInt(f.copies.value, 10) || 1)) } });
      $el.find('.bt-box').toggleClass('d-none', f.method.value !== 'bluetooth');
    });
    $el.on('click', '.btn-bt-connect', async () => { try { const n = await Printer.connectBluetooth(); UI.toast(`${t('set.connected')}: ${n || ''}`); } catch (e) { UI.toastError(e); } btStatus(); });
    $el.on('click', '.btn-bt-disconnect', () => { Printer.disconnect(); btStatus(); });
    $el.on('click', '.btn-test', async () => { try { await Printer.testPrint(); } catch (e) { UI.toastError(e); } });
    const { canInstall, promptInstall } = await import('../app.js');
    if (canInstall()) $el.find('.btn-install').removeClass('d-none').on('click', promptInstall);
    $el.on('click', '.btn-integrity', async () => {
      const r = await UI.withLoading(() => Posting.integrityCheck());
      await UI.confirmDialog(r.issues.length ? `<div class="alert alert-warning small">${r.issues.slice(0, 40).map(esc).join('<br>')}</div>` : `<div class="alert alert-success mb-0">${esc(t('set.checkOk'))}</div>`, { html: true, title: t('set.check'), okLabel: t('act.ok') });
    });
  },
  destroy() { this._off?.(); this._off = null; },
};
