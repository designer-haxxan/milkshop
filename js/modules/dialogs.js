// Dialogs shared by several screens: customer / supplier forms, receive & pay money, bill sharing and printing.
import * as UI from '../core/ui.js';
import { esc, fmtMoney, fmtQty, num, today, round2 } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { cur, monthLabel, unitLabel } from '../core/views.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as Milk from '../services/milk.js';
import * as Printer from '../printer/printer.js';
import * as idb from '../db/idb.js';

const $ = window.jQuery;

const field = (name, label, value = '', attrs = '') => `<div class="mb-3"><label class="form-label">${esc(label)}</label><input name="${name}" class="form-control" value="${esc(value)}" ${attrs}></div>`;

// ---------- customer ----------
export function customerForm(c = null) {
  const m = c?.milk || null;
  const milkId = Milk.milkProductId();
  const defRate = m?.rate ?? Catalog.product(milkId)?.salePrice ?? '';
  const areas = Milk.areas();
  return UI.formModal({
    title: c ? t('cu.edit') : t('cu.add'), submitLabel: t('act.save'), submitClass: 'btn-success btn-lg',
    body: `${field('name', t('cu.name'), c?.name, 'required')}
      ${field('phone', t('cu.phone'), c?.phone, 'inputmode="tel" dir="ltr" placeholder="03xx-xxxxxxx"')}
      ${field('address', t('cu.address'), c?.address)}
      <div class="form-check form-switch fs-5 mb-3"><input class="form-check-input" type="checkbox" role="switch" name="delivery" id="f-del" ${m || !c ? 'checked' : ''}><label class="form-check-label fw-bold" for="f-del">${esc(t('cu.daily'))}</label></div>
      <div id="f-milk" class="p-3 mb-3 rounded-4" style="background:var(--brand-soft)">
        <div class="mb-3"><label class="form-label">${esc(t('cu.area'))}</label><input name="area" class="form-control" list="f-areas" value="${esc(m?.area || '')}" placeholder="${esc(t('cu.areaHint'))}"><datalist id="f-areas">${areas.map((a) => `<option value="${esc(a)}">`).join('')}</datalist></div>
        <div class="row g-3 mb-3">
          <div class="col-6"><label class="form-label"><i class="bi bi-sunrise-fill text-warn"></i> ${esc(t('shift.m'))} (${esc(t('unit.L'))})</label><input name="morning" class="form-control" inputmode="decimal" dir="ltr" value="${m ? num(m.morning) : 1}"></div>
          <div class="col-6"><label class="form-label"><i class="bi bi-moon-stars-fill" style="color:#6366f1"></i> ${esc(t('shift.e'))} (${esc(t('unit.L'))})</label><input name="evening" class="form-control" inputmode="decimal" dir="ltr" value="${m ? num(m.evening) : 0}"></div>
        </div>
        <div class="row g-3">
          <div class="col-6"><label class="form-label">${esc(t('cu.rate'))}</label><input name="rate" class="form-control" inputmode="decimal" dir="ltr" value="${esc(defRate)}"></div>
          <div class="col-6"><label class="form-label">${esc(t('cu.start'))}</label><input name="start" type="date" class="form-control" dir="ltr" value="${esc(m?.start || today())}"></div>
        </div></div>
      ${field('opening', t('cu.opening'), c?.openingBalance || '', 'inputmode="decimal" dir="ltr" placeholder="0"')}
      <div class="small text-body-secondary">${esc(t('cu.openingHelp'))}</div>`,
    onShown: (el) => {
      const sync = () => el.find('#f-milk').toggle(el.find('#f-del').prop('checked'));
      el.on('change', '#f-del', sync); sync();
      el.find('[name=name]').trigger('focus');
    },
    onSubmit: async (v) => {
      let milk;
      if (v.delivery) {
        const morning = num(v.morning); const evening = num(v.evening); const rate = num(v.rate);
        if (!(morning > 0 || evening > 0)) throw new Error(t('cu.errQty'));
        if (!(rate > 0)) throw new Error(t('cu.errRate'));
        milk = { ...(m || {}), productId: m?.productId || milkId, rate, morning, evening, area: v.area.trim(), start: v.start || today() };
      } else milk = null;
      const rec = await Posting.saveParty('customers', { id: c?.id, name: v.name, phone: v.phone, address: v.address, openingBalance: num(v.opening), milk });
      UI.toast(t('saved'));
      return rec;
    },
  });
}

export function supplierForm(s = null) {
  return UI.formModal({
    title: s ? t('su.edit') : t('su.add'), submitLabel: t('act.save'), submitClass: 'btn-success btn-lg',
    body: `${field('name', t('su.name'), s?.name, 'required')}${field('phone', t('cu.phone'), s?.phone, 'inputmode="tel" dir="ltr"')}${field('address', t('cu.address'), s?.address)}
      ${field('opening', t('su.opening'), s?.openingBalance || '', 'inputmode="decimal" dir="ltr" placeholder="0"')}<div class="small text-body-secondary">${esc(t('su.openingHelp'))}</div>`,
    onSubmit: async (v) => { const rec = await Posting.saveParty('suppliers', { id: s?.id, name: v.name, phone: v.phone, address: v.address, openingBalance: num(v.opening) }); UI.toast(t('saved')); return rec; },
  });
}

// ---------- money in / out ----------
function amountBody(label, suggested, noteLabel) {
  return `<div class="mb-3"><label class="form-label">${esc(label)}</label><input name="amount" class="form-control form-control-lg text-center" inputmode="decimal" dir="ltr" value="${suggested > 0 ? Math.round(suggested) : ''}" required></div>
    ${suggested > 0 ? `<div class="mb-3 text-center"><button type="button" class="btn btn-light" data-full="${Math.round(suggested)}">${esc(t('money.full'))}: ${esc(cur())} ${fmtMoney(suggested)}</button></div>` : ''}
    <div class="mb-1"><label class="form-label">${esc(noteLabel)}</label><input name="note" class="form-control"></div>`;
}
const fullBtn = (el) => el.on('click', '[data-full]', function () { el.find('[name=amount]').val(this.dataset.full); });

export function receiveDialog(customer, suggested = 0) {
  return UI.formModal({
    title: `${t('money.receive')} — ${customer.name}`, submitLabel: t('money.receiveBtn'), submitClass: 'btn-success btn-lg',
    body: amountBody(t('money.amount'), suggested, t('money.note')),
    onShown: (el) => { fullBtn(el); el.find('[name=amount]').trigger('focus').trigger('select'); },
    onSubmit: async (v) => { const r = await Milk.receiveFromCustomer(customer.id, num(v.amount), v.note); UI.toast(t('money.received', { n: `${cur()} ${fmtMoney(num(v.amount))}` })); return r.doc; },
  });
}

export function payDialog(supplier, suggested = 0) {
  return UI.formModal({
    title: `${t('money.pay')} — ${supplier.name}`, submitLabel: t('money.payBtn'), submitClass: 'btn-primary btn-lg',
    body: amountBody(t('money.amount'), suggested, t('money.note')),
    onShown: (el) => { fullBtn(el); el.find('[name=amount]').trigger('focus').trigger('select'); },
    onSubmit: async (v) => { const r = await Milk.payToSupplier(supplier.id, num(v.amount), v.note); UI.toast(t('saved')); return r.doc; },
  });
}

export function expenseDialog() {
  const cats = ['rent', 'fuel', 'salary', 'feed', 'electric', 'packing', 'other'];
  return UI.formModal({
    title: t('money.expense'), submitLabel: t('act.save'), submitClass: 'btn-primary btn-lg',
    body: `<div class="mb-3"><label class="form-label">${esc(t('money.expType'))}</label><div class="chips flex-wrap" style="flex-wrap:wrap" id="exp-cats">${cats.map((c, i) => `<button type="button" class="pill ${i === 0 ? 'active' : ''}" data-c="${c}">${esc(t('exp.' + c))}</button>`).join('')}</div><input type="hidden" name="cat" value="rent"></div>
      <div class="mb-3"><label class="form-label">${esc(t('money.amount'))}</label><input name="amount" class="form-control form-control-lg text-center" inputmode="decimal" dir="ltr" required></div>
      <div class="mb-1"><label class="form-label">${esc(t('money.note'))}</label><input name="note" class="form-control"></div>`,
    onShown: (el) => el.on('click', '#exp-cats .pill', function () { el.find('#exp-cats .pill').removeClass('active'); $(this).addClass('active'); el.find('[name=cat]').val(this.dataset.c); }),
    onSubmit: async (v) => {
      await Milk.addExpense(num(v.amount), [t('exp.' + v.cat), v.note].filter(Boolean).join(' — '));
      UI.toast(t('saved')); return true;
    },
  });
}

// ---------- bills: text, WhatsApp, print ----------
export async function billText(customer, bill, total) {
  const items = await idb.getAllByIndex('saleItems', 'saleId', bill.id);
  const lines = items.sort((a, b) => a.line - b.line).map((i) => `• ${i.name}: ${fmtQty(i.qty)} ${unitLabel(i.unit)} × ${fmtMoney(i.rate)} = ${cur()} ${fmtMoney(i.amount)}`);
  const prev = round2(total - bill.total);
  return [
    t('wa.hello', { name: customer.name }), getSettings().business.name, '',
    t('wa.billOf', { m: bill.bill ? monthLabel(bill.bill.month) : '' }), ...lines, '',
    `${t('wa.thisBill')}: ${cur()} ${fmtMoney(bill.total)}`,
    Math.abs(prev) >= 0.5 ? `${t(prev > 0 ? 'wa.prev' : 'wa.advance')}: ${cur()} ${fmtMoney(Math.abs(prev))}` : '',
    `*${t('wa.totalDue')}: ${cur()} ${fmtMoney(total)}*`, '', t('wa.thanks'), getSettings().business.phone || '',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}

export async function sendWhatsApp(customer, text) {
  if (!Milk.waPhone(customer.phone)) { UI.toast(t('wa.nophone'), 'warning'); return; }
  window.open(Milk.waLink(customer.phone, text), '_blank', 'noopener');
}

export async function printDoc(kind, doc) {
  try { await Printer.printDocument(kind, doc); } catch (e) { UI.toastError(e); }
}
