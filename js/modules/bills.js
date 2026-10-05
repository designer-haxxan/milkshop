// Monthly bills (بل): make every house's bill in one tap, send it on WhatsApp or print it, and collect the money.
import * as UI from '../core/ui.js';
import { esc, fmtMoney, fmtQty, debounce } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { cur, balChip, monthLabel, pager } from '../core/views.js';
import * as Catalog from '../services/catalog.js';
import * as Milk from '../services/milk.js';
import * as D from './dialogs.js';
import * as idb from '../db/idb.js';

const $ = window.jQuery;
let st = null;
let onData = null;

async function build() {
  const month = st.month;
  const [bals, monthBills] = await Promise.all([Milk.customerBalances(), Milk.billsOfMonth(month)]);
  const billBy = new Map(); for (const b of monthBills) (billBy.get(b.customerId) || billBy.set(b.customerId, []).get(b.customerId)).push(b);
  const customers = Catalog.allParties('customers').filter((c) => c.active !== 0);
  const previews = await Promise.all(customers.map((c) => Milk.previewBill(c.id, month)));
  const rows = [];
  customers.forEach((c, i) => {
    const pv = previews[i]; const made = billBy.get(c.id) || [];
    if (!pv.ids.length && !made.length) return;
    rows.push({ c, pv, made, bal: bals.get(c.id) || { total: 0 } });
  });
  rows.sort((a, b) => (a.pv.ids.length ? 0 : 1) - (b.pv.ids.length ? 0 : 1) || a.c.name.localeCompare(b.c.name, 'ur'));
  st.rows = rows;
}

function rowHtml(r) {
  const pending = r.pv.ids.length > 0;
  const billedTotal = r.made.reduce((s, b) => s + b.total, 0);
  return `<div class="list-row bill-row" data-id="${esc(r.c.id)}">${UI.avatar(r.c.name)}
    <div class="grow"><div class="t text-truncate">${esc(r.c.name)}</div>
      <div class="s">${pending ? `${fmtQty(r.pv.qty)} ${esc(t('unit.L'))} · ${esc(t('bl.days', { n: r.pv.days }))}` : esc(t('bl.made'))}</div>
      <div class="mt-1">${balChip(r.bal.total)}</div></div>
    <div class="amt"><div class="v">${esc(cur())} ${fmtMoney(pending ? r.pv.total : billedTotal)}</div>
      ${pending ? `<span class="chip warn">${esc(t('bl.pending'))}</span>` : `<span class="chip ok"><i class="bi bi-check-lg"></i>${esc(t('bl.done'))}</span>`}</div>
    <div class="d-flex flex-column gap-1">
      ${pending ? `<button class="btn btn-primary btn-sm" data-a="make"><i class="bi bi-receipt-cutoff"></i></button>`
        : `<button class="btn btn-wa btn-sm" data-a="wa"><i class="bi bi-whatsapp"></i></button><button class="btn btn-light btn-sm" data-a="print"><i class="bi bi-printer-fill"></i></button>`}
      ${r.bal.total > 0.5 ? `<button class="btn btn-success btn-sm" data-a="pay"><i class="bi bi-cash-coin"></i></button>` : ''}</div></div>`;
}

function draw() {
  const rows = st.rows;
  const pend = rows.filter((r) => r.pv.ids.length);
  const made = rows.filter((r) => !r.pv.ids.length);
  const totalMade = made.reduce((s, r) => s + r.made.reduce((a, b) => a + b.total, 0), 0);
  const totalPend = pend.reduce((s, r) => s + r.pv.total, 0);
  const $r = $(st.root);
  $r.find('#bl-month').text(monthLabel(st.month));
  $r.find('#bl-sum').html(`<div class="stat-grid stagger"><div class="stat-card"><div class="l"><i class="bi bi-hourglass-split text-warn"></i>${esc(t('bl.pending'))}</div><div class="v">${pend.length}</div><div class="text-body-secondary">${esc(cur())} ${fmtMoney(totalPend)}</div></div>
    <div class="stat-card"><div class="l"><i class="bi bi-check-circle-fill text-ok"></i>${esc(t('bl.done'))}</div><div class="v">${made.length}</div><div class="text-body-secondary">${esc(cur())} ${fmtMoney(totalMade)}</div></div></div>`);
  $r.find('#bl-all').toggleClass('d-none', !pend.length).find('.n').text(pend.length);
  pager($r.find('#bl-list'), rows, rowHtml, 40, UI.emptyState(t('bl.empty'), 'receipt'));
}

async function refresh() { await build(); draw(); }

async function waFor(r) {
  const bill = r.made[r.made.length - 1];
  D.sendWhatsApp(r.c, await D.billText(r.c, bill, r.bal.total));
}

export default {
  async render(root) {
    st = { root, month: Milk.monthOf(), rows: [] };
    root.innerHTML = `
      <div class="page-header"><h1 class="dup">${esc(t('nav.bills'))}</h1></div>
      <div class="d-flex align-items-center gap-2 mb-3"><button class="btn btn-light" data-mn="-1"><i class="bi bi-chevron-left"></i></button><div class="flex-grow-1 text-center fw-bold fs-4" id="bl-month"></div><button class="btn btn-light" data-mn="1"><i class="bi bi-chevron-right"></i></button></div>
      <div id="bl-sum" class="mb-3"></div>
      <button class="btn btn-success btn-lg w-100 mb-3 d-none" id="bl-all"><i class="bi bi-magic"></i>${esc(t('bl.makeAll'))} (<span class="n"></span>)</button>
      <div class="help-card mb-3"><i class="bi bi-lightbulb-fill fs-4 text-warn"></i><div class="small">${esc(t('bl.help'))}</div></div>
      <div class="list-card" id="bl-list"></div>`;
    await UI.withLoading(refresh);
    const $r = $(root);
    $r.on('click', '[data-mn]', async function () { st.month = Milk.addMonths(st.month, +this.dataset.mn); await UI.withLoading(refresh); });
    $r.on('click', '#bl-all', async () => {
      const pend = st.rows.filter((r) => r.pv.ids.length);
      if (!await UI.confirmDialog(t('bl.makeAllAsk', { n: pend.length, m: monthLabel(st.month) }), { title: t('bl.makeAll'), okLabel: t('bl.makeAll'), okClass: 'btn-success' })) return;
      let ok = 0; let fail = 0;
      await UI.withLoading(async () => { for (const r of pend) { try { await Milk.makeBill(r.c.id, st.month); ok++; } catch (e) { console.warn(e); fail++; } } }, t('wait'));
      UI.toast(t('bl.madeN', { n: ok }) + (fail ? ` (${fail} ✖)` : ''), fail ? 'warning' : 'success');
      await refresh();
    });
    $r.on('click', '.bill-row [data-a]', async function () {
      const r = st.rows.find((x) => x.c.id === $(this).closest('.bill-row').data('id'));
      const a = this.dataset.a;
      try {
        if (a === 'make') { await UI.withLoading(() => Milk.makeBill(r.c.id, st.month)); UI.toast(t('saved')); await refresh(); }
        else if (a === 'wa') await waFor(r);
        else if (a === 'print') D.printDoc('sale', await idb.get('sales', r.made[r.made.length - 1].id));
        else if (a === 'pay') { if (await D.receiveDialog(r.c, Math.max(0, r.bal.total))) await refresh(); }
      } catch (e) { UI.toastError(e); }
    });
    $r.on('click', '.bill-row .t, .bill-row .avatar', function () { location.hash = `#/customers/${encodeURIComponent($(this).closest('.bill-row').data('id'))}`; });
    onData = debounce(() => { if (root.isConnected && st) refresh(); }, 400);
    document.addEventListener('data:changed', onData);
  },
  destroy() { if (onData) document.removeEventListener('data:changed', onData); onData = null; st = null; },
};
