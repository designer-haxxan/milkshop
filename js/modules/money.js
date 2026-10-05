// Money (رقم): collect from customers, pay suppliers, record expenses; who still owes you.
import * as UI from '../core/ui.js';
import { esc, fmtMoney, fmtDate } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { cur, pager } from '../core/views.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as Milk from '../services/milk.js';
import * as idb from '../db/idb.js';
import * as D from './dialogs.js';

const $ = window.jQuery;
let st = null;

const ICON = { receipt: ['arrow-down-circle-fill', 'text-ok'], payment: ['arrow-up-circle-fill', 'text-bad'], transfer: ['arrow-left-right', ''] };

async function draw() {
  const [cash, bals] = await Promise.all([Milk.cashInHand(), Milk.customerBalances()]);
  const $r = $(st.root);
  const owing = Catalog.allParties('customers').map((c) => ({ c, b: bals.get(c.id) })).filter((x) => x.b && x.b.total > 0.5).sort((a, b) => b.b.total - a.b.total);
  const totalOwed = owing.reduce((s, x) => s + x.b.total, 0);
  $r.find('#mn-cash').text(`${cur()} ${fmtMoney(cash)}`);
  $r.find('#mn-owed').text(`${cur()} ${fmtMoney(totalOwed)}`);
  $r.find('#seg button').each(function () { $(this).toggleClass('active', this.dataset.t === st.tab); });
  if (st.tab === 'owe') {
    pager($r.find('#mn-list'), owing, ({ c, b }) => `<div class="list-row" data-id="${esc(c.id)}">${UI.avatar(c.name)}<div class="grow"><div class="t text-truncate">${esc(c.name)}</div><div class="s">${esc(c.milk?.area || c.phone || '')}</div></div>
      <div class="text-end"><div class="money text-bad">${esc(cur())} ${fmtMoney(b.total)}</div></div><button class="btn btn-success btn-sm" data-a="rcv"><i class="bi bi-cash-coin"></i></button></div>`, 40, UI.emptyState(t('mn.noDue'), 'emoji-smile'));
  } else {
    const vs = (await idb.getAll('vouchers')).filter((v) => v.status !== 'void').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    pager($r.find('#mn-list'), vs, (v) => { const [ic, cl] = ICON[v.type]; return `<div class="list-row" data-id="${esc(v.id)}"><i class="bi bi-${ic} fs-3 ${cl}"></i><div class="grow"><div class="t text-truncate">${esc(v.counterName)}</div><div class="s">${esc(fmtDate(v.date))}${v.note ? ' · ' + esc(v.note) : ''}</div></div>
      <div class="money ${cl}">${v.type === 'receipt' ? '+' : '−'} ${fmtMoney(v.amount)}</div><button class="btn btn-light btn-sm text-danger" data-a="void"><i class="bi bi-trash3"></i></button></div>`; }, 40, UI.emptyState(t('mn.noHistory'), 'cash-coin'));
  }
}

async function pickCustomer() {
  const pick = await UI.pick({ title: t('sh.pickCustomer'), placeholder: t('search'), search: (q) => Catalog.searchParties('customers', q, 40).map((c) => ({ id: c.id, title: c.name, subtitle: c.milk?.area || c.phone || '', value: c })) });
  return pick?.value || null;
}

export default {
  async render(root) {
    st = { root, tab: 'owe' };
    root.innerHTML = `<div class="page-header"><h1 class="dup">${esc(t('nav.money'))}</h1></div>
      <div class="stat-grid mb-3 stagger"><div class="stat-card"><div class="l"><i class="bi bi-wallet2 text-ok"></i>${esc(t('mn.cash'))}</div><div class="v" id="mn-cash"></div></div>
        <div class="stat-card"><div class="l"><i class="bi bi-hourglass-split text-bad"></i>${esc(t('mn.owed'))}</div><div class="v" id="mn-owed"></div></div></div>
      <div class="act-row mb-3" style="grid-template-columns:repeat(3,1fr)">
        <button class="btn btn-success" id="mn-rcv"><i class="bi bi-arrow-down-circle-fill fs-3"></i>${esc(t('money.receive'))}</button>
        <button class="btn btn-primary" id="mn-pay"><i class="bi bi-arrow-up-circle-fill fs-3"></i>${esc(t('money.pay'))}</button>
        <button class="btn btn-warning" id="mn-exp"><i class="bi bi-receipt fs-3"></i>${esc(t('money.expense'))}</button></div>
      <div class="seg mb-3" id="seg"><button data-t="owe"><i class="bi bi-person-exclamation"></i>${esc(t('mn.tabOwe'))}</button><button data-t="hist"><i class="bi bi-clock-history"></i>${esc(t('mn.tabHist'))}</button></div>
      <div class="list-card" id="mn-list"></div>`;
    await draw();
    const $r = $(root);
    $r.on('click', '#seg button', async function () { st.tab = this.dataset.t; await draw(); });
    $r.on('click', '#mn-rcv', async () => { const c = await pickCustomer(); if (c) { const b = (await Milk.customerBalances()).get(c.id); if (await D.receiveDialog(c, Math.max(0, b?.total || 0))) await draw(); } });
    $r.on('click', '#mn-pay', async () => {
      const pick = await UI.pick({ title: t('by.pickSupplier'), placeholder: t('search'), search: (q) => Catalog.searchParties('suppliers', q, 40).map((s) => ({ id: s.id, title: s.name, subtitle: s.phone || '', value: s })) });
      if (pick?.value) { const b = (await Milk.supplierBalances()).get(pick.value.id) || 0; if (await D.payDialog(pick.value, Math.max(0, b))) await draw(); }
    });
    $r.on('click', '#mn-exp', async () => { if (await D.expenseDialog()) await draw(); });
    $r.on('click', '#mn-list [data-a=rcv]', async function () {
      const id = $(this).closest('[data-id]').data('id'); const b = (await Milk.customerBalances()).get(id);
      if (await D.receiveDialog(Catalog.party('customers', id), Math.max(0, b?.total || 0))) await draw();
    });
    $r.on('click', '#mn-list [data-a=void]', async function () {
      if (!await UI.confirmDialog(t('mn.voidAsk'), { title: t('act.delete'), okLabel: t('act.delete'), okClass: 'btn-danger' })) return;
      try { await Posting.voidDocument('voucher', $(this).closest('[data-id]').data('id'), 'deleted'); UI.toast(t('deleted')); await draw(); } catch (e) { UI.toastError(e); }
    });
  },
  destroy() { st = null; },
};
