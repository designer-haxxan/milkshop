// Profit (منافع): income minus milk purchase and expenses, plus litres bought vs sold.
import { esc, fmtMoney, fmtQty, today, localDate } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { cur, monthLabel } from '../core/views.js';
import * as Milk from '../services/milk.js';
import * as UI from '../core/ui.js';

const $ = window.jQuery;
let st = null;

function range(key) {
  const d = new Date(); const td = today();
  if (key === 'today') return [td, td];
  if (key === 'week') { const s = new Date(d); s.setDate(d.getDate() - 6); return [localDate(s), td]; }
  if (key === 'prev') { const m = Milk.addMonths(Milk.monthOf(), -1); return [Milk.monthStartOf(m), Milk.monthEndOf(m)]; }
  return [Milk.monthStartOf(Milk.monthOf()), td];
}

async function draw() {
  const [from, to] = range(st.key);
  const s = await Milk.summary(from, to);
  const max = Math.max(s.income, s.purchases, s.expenses, 1);
  const bar = (label, v, color) => `<div class="bar-row"><div class="lb">${esc(label)}</div><div class="tr"><i style="width:${Math.max(2, (v / max) * 100)}%;background:${color}"></i></div><div class="money" style="min-width:84px;text-align:end">${fmtMoney(v)}</div></div>`;
  const diff = s.purchaseQty - s.soldQty;
  const $r = $(st.root);
  $r.find('#seg button').each(function () { $(this).toggleClass('active', this.dataset.k === st.key); });
  $r.find('#pf-body').html(`
    <div class="bal-box ${s.profit >= 0 ? 'clear' : 'due'} mb-3 text-center"><div>${esc(t(s.profit >= 0 ? 'pf.profit' : 'pf.loss'))}</div><div class="profit-big"><span data-count="${Math.abs(s.profit)}">0</span></div>
      <div class="small">${st.key === 'prev' ? esc(monthLabel(Milk.addMonths(Milk.monthOf(), -1))) : ''}</div></div>
    <div class="card p-3 mb-3">
      ${bar(t('pf.income'), s.income, '#16a34a')}${bar(t('pf.buy'), s.purchases, '#0b6fd0')}${bar(t('pf.exp'), s.expenses, '#d97706')}
      <hr><div class="d-flex justify-content-between small text-body-secondary"><span>${esc(t('pf.delivery'))}</span><b>${esc(cur())} ${fmtMoney(s.deliveryValue)}</b></div>
      <div class="d-flex justify-content-between small text-body-secondary"><span>${esc(t('pf.shop'))}</span><b>${esc(cur())} ${fmtMoney(s.shopSales)}</b></div></div>
    <div class="stat-grid stagger mb-3">
      <div class="stat-card"><div class="l"><i class="bi bi-truck text-info"></i>${esc(t('pf.bought'))}</div><div class="v">${fmtQty(s.purchaseQty)} <small class="fs-6">${esc(t('unit.L'))}</small></div></div>
      <div class="stat-card"><div class="l"><i class="bi bi-bag-check-fill text-ok"></i>${esc(t('pf.sold'))}</div><div class="v">${fmtQty(s.soldQty)} <small class="fs-6">${esc(t('unit.L'))}</small></div></div>
      <div class="stat-card"><div class="l"><i class="bi bi-cash-coin text-ok"></i>${esc(t('pf.received'))}</div><div class="v">${esc(cur())} ${fmtMoney(s.received + s.cashSales)}</div></div>
      <div class="stat-card"><div class="l"><i class="bi bi-people-fill text-primary"></i>${esc(t('pf.houses'))}</div><div class="v">${s.deliveryHouses}</div></div></div>
    ${s.purchaseQty > 0 ? `<div class="help-card"><i class="bi bi-droplet-half fs-3 text-warn"></i><div><b>${esc(t(diff > 0 ? 'pf.leftover' : 'pf.shortage'))}: ${fmtQty(Math.abs(diff))} ${esc(t('unit.L'))}</b><div class="small">${esc(t('pf.diffHelp'))}</div></div></div>` : ''}`);
  UI.countUp(st.root, (v) => `${cur()} ${fmtMoney(v)}`);
}

export default {
  async render(root) {
    st = { root, key: 'month' };
    root.innerHTML = `<div class="page-header"><h1 class="dup">${esc(t('nav.profit'))}</h1></div>
      <div class="chips" id="seg">${['today', 'week', 'month', 'prev'].map((k) => `<button class="pill" data-k="${k}">${esc(t('pf.' + k))}</button>`).join('')}</div><div id="pf-body"></div>`;
    await draw();
    $(root).on('click', '#seg [data-k]', async function () { st.key = this.dataset.k; await draw(); });
  },
  destroy() { st = null; },
};
