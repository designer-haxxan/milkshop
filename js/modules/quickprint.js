// Quick print (کوئیک پرنٹ): large price display, print via Bluetooth thermal printer.
import * as UI from '../core/ui.js';
import { esc, fmtMoney } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { getSettings } from '../core/settings.js';
import * as Printer from '../printer/printer.js';
import { toEscPos, toHTML } from '../printer/receipt.js';

const $ = window.jQuery;

export default {
  async render(el) {
    const $el = $(el);
    const cur = getSettings().currency;
    $el.html(`<div class="page-header"><h1>${esc(t('nav.quickprint'))}</h1></div>
      <div class="card p-4 mb-3">
        <div class="mb-3"><label class="form-label fw-bold">${esc(t('qp.enterPrice'))}</label>
          <div class="input-group input-group-lg">
            <span class="input-group-text fw-bold fs-4">${esc(cur)}</span>
            <input type="number" id="qp-price" class="form-control text-center fw-bold" inputmode="decimal" placeholder="0" min="0" step="0.01">
          </div></div>
        <div class="mb-3"><label class="form-label">${esc(t('qp.label'))}</label>
          <input type="text" id="qp-label" class="form-control" placeholder="${esc(t('qp.labelHint'))}" maxlength="30">
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary flex-fill" id="qp-preview"><i class="bi bi-eye me-1"></i>${esc(t('qp.preview'))}</button>
          <button class="btn btn-success flex-fill" id="qp-print"><i class="bi bi-printer-fill me-1"></i>${esc(t('qp.print'))}</button>
        </div></div>
      <div id="qp-preview-box" class="d-none"></div>`);

    const $price = $el.find('#qp-price');
    const $label = $el.find('#qp-label');
    const $preview = $el.find('#qp-preview-box');

    function showPreview() {
      const price = parseFloat($price.val()) || 0;
      const label = $label.val().trim();
      const html = `<div class="card p-4 mb-3">
        <div class="text-center">
          <div class="text-muted small mb-2">${esc(label || t('qp.label'))}</div>
          <div class="display-3 fw-bold text-primary">${cur} ${fmtMoney(price)}</div>
        </div></div>`;
      $preview.html(html).removeClass('d-none');
    }

    async function printPrice() {
      const price = parseFloat($price.val());
      if (!price || price <= 0) return UI.toast(t('qp.priceRequired'), 'warning');
      const label = $label.val().trim();
      try {
        const s = getSettings();
        // Build a receipt model for the price tag
        const doc = {
          header: label ? [label] : [],
          title: `${cur} ${fmtMoney(price)}`,
          items: [],
          totals: [],
          footer: ''
        };
        // Use the proven receipt functions that handle Urdu and all printer types
        const bytes = await toEscPos(doc, s.printer.width);
        const html = toHTML(doc, s.printer.width);

        // Print using the routing function that handles Bluetooth, RawBT, or browser
        await Printer.printBytes(bytes, html, { width: s.printer.width });
        UI.toast(t('qp.printed'));
        $price.val('').focus();
        $label.val('');
        $preview.addClass('d-none');
      } catch (e) { UI.toastError(e); }
    }

    $el.on('click', '#qp-preview', showPreview);
    $el.on('click', '#qp-print', printPrice);
    $el.on('change input', '#qp-price, #qp-label', showPreview);
    $price.focus();
  }
};
