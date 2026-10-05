// Shop counter (دکان): tap products, see the total, take cash or write it on a customer's account (ادھار).
import * as UI from '../core/ui.js';
import { esc, fmtMoney, fmtQty, uuid, num, round2, round3, today, fmtTime } from '../core/utils.js';
import { pref } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { cur, unitLabel, productEmoji } from '../core/views.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as idb from '../db/idb.js';
import * as D from './dialogs.js';

const $ = window.jQuery;
let st = null;

const newCart = () => ({ id: uuid(), lines: [], customerId: null, pay: 'cash' });
const saveCart = () => pref.set('shopCart', st.cart);
const stepOf = (p) => (p?.unit === 'pcs' ? 1 : 0.5);
const total = () => round2(st.cart.lines.reduce((s, l) => s + l.qty * l.rate, 0));
const count = () => st.cart.lines.length;

function products() {
  const q = st.q.trim().toLowerCase();
  return Catalog.allProducts().filter((p) => p.active && (!q || p.name.toLowerCase().includes(q))).sort((a, b) => (b.milk ? 1 : 0) - (a.milk ? 1 : 0) || a.name.localeCompare(b.name, 'ur'));
}

function drawTiles() {
  const ps = products();
  $(st.root).find('#sh-grid').html(ps.length ? ps.map((p) => {
    const line = st.cart.lines.find((l) => l.productId === p.id);
    return `<button class="product-tile ${line ? 'in' : ''}" data-id="${esc(p.id)}"><span class="em">${productEmoji(p)}</span><span class="n">${esc(p.name)}</span><span class="p">${esc(cur())} ${fmtMoney(p.salePrice)} / ${esc(unitLabel(p.unit))}</span>${line ? `<span class="cnt">${fmtQty(line.qty)}</span>` : ''}</button>`;
  }).join('') : UI.emptyState(t('sh.noProducts'), 'box-seam'));
  const n = count();
  $(st.root).find('#sh-bar').toggleClass('d-none', !n).find('.v').text(`${cur()} ${fmtMoney(total())}`);
  $(st.root).find('#sh-bar .c').text(t('sh.items', { n }));
}

function addProduct(id) {
  const p = Catalog.product(id); if (!p) return;
  const line = st.cart.lines.find((l) => l.productId === id);
  if (line) line.qty = round3(line.qty + (p.unit === 'pcs' ? 1 : 1)); else st.cart.lines.push({ productId: id, qty: 1, rate: p.salePrice });
  if (navigator.vibrate) navigator.vibrate(15);
  saveCart(); drawTiles();
}

// ---------- checkout ----------
function checkout() {
  const m = UI.modal({ title: t('sh.checkout'), size: 'md', body: '<div id="co"></div>', footer: null });
  const $c = m.$el.find('#co');
  const fresh = () => { st.cart.lines = st.cart.lines.filter((l) => l.qty > 0); };
  const draw = () => {
    fresh(); saveCart();
    if (!st.cart.lines.length) { m.close(); drawTiles(); return; }
    const sub = total(); const disc = Math.min(sub, Math.max(0, num(st.cart.discount)));
    const due = round2(sub - disc);
    const cust = st.cart.customerId ? Catalog.party('customers', st.cart.customerId) : null;
    const tendered = st.cart.tendered === undefined ? due : num(st.cart.tendered);
    $c.html(`
      ${st.cart.lines.map((l, i) => { const p = Catalog.product(l.productId); return `<div class="cart-line" data-i="${i}"><span class="fs-2">${productEmoji(p || {})}</span>
        <div class="flex-grow-1"><div class="fw-bold">${esc(p?.name || '?')}</div><button class="btn btn-link p-0 text-body-secondary" data-a="rate">${esc(cur())} ${fmtMoney(l.rate)} / ${esc(unitLabel(p?.unit))} <i class="bi bi-pencil-fill small"></i></button></div>
        <div class="stepper"><button data-a="plus">+</button><input value="${l.qty}" data-a="qty" inputmode="decimal" dir="ltr" style="width:70px"><button data-a="minus">−</button></div>
        <div class="money" style="min-width:64px;text-align:end">${fmtMoney(l.qty * l.rate)}</div></div>`; }).join('')}
      <div class="d-flex justify-content-between align-items-center mt-3"><button class="btn btn-light btn-sm" data-a="disc"><i class="bi bi-percent"></i> ${esc(t('sh.discount'))}${disc ? `: ${fmtMoney(disc)}` : ''}</button><div class="text-body-secondary">${esc(t('sh.items', { n: st.cart.lines.length }))}</div></div>
      <div class="checkout-total my-2">${esc(cur())} ${fmtMoney(due)}</div>
      <div class="pay-pick mb-3"><button data-pay="cash" class="${st.cart.pay === 'cash' ? 'active' : ''}"><i class="bi bi-cash-stack"></i>${esc(t('sh.cash'))}</button><button data-pay="credit" class="${st.cart.pay === 'credit' ? 'active' : ''}"><i class="bi bi-journal-bookmark-fill"></i>${esc(t('sh.credit'))}</button></div>
      ${st.cart.pay === 'credit' ? `<button class="btn btn-light w-100 mb-3 py-3" data-a="cust"><i class="bi bi-person-fill"></i> ${cust ? `<b>${esc(cust.name)}</b>` : esc(t('sh.pickCustomer'))}</button>
        <div class="mb-3"><label class="form-label">${esc(t('sh.paidNow'))}</label><input class="form-control form-control-lg text-center" data-a="tender" inputmode="decimal" dir="ltr" value="${st.cart.tendered === undefined ? 0 : num(st.cart.tendered)}"></div>`
      : `<div class="mb-3"><label class="form-label">${esc(t('sh.received'))}</label><input class="form-control form-control-lg text-center" data-a="tender" inputmode="decimal" dir="ltr" value="${st.cart.tendered === undefined ? due : num(st.cart.tendered)}"></div>
        ${tendered > due ? `<div class="alert alert-success text-center fs-4 fw-bold py-2">${esc(t('sh.change'))}: ${esc(cur())} ${fmtMoney(tendered - due)}</div>` : ''}`}
      <button class="btn btn-success btn-lg w-100" data-a="save"><i class="bi bi-check-lg"></i>${esc(t('sh.save'))}</button>`);
  };
  draw();
  const line = (el) => st.cart.lines[$(el).closest('.cart-line').data('i')];
  m.$el.on('click', '[data-a=plus]', function () { const l = line(this); l.qty = round3(l.qty + stepOf(Catalog.product(l.productId))); draw(); });
  m.$el.on('click', '[data-a=minus]', function () { const l = line(this); l.qty = round3(l.qty - stepOf(Catalog.product(l.productId))); draw(); });
  m.$el.on('change', 'input[data-a=qty]', function () { line(this).qty = round3(num(this.value)); draw(); });
  m.$el.on('click', '[data-a=rate]', async function () {
    const l = line(this);
    const r = await UI.formModal({ title: t('sh.price'), body: `<input name="rate" class="form-control form-control-lg text-center" inputmode="decimal" dir="ltr" value="${l.rate}">`, onSubmit: (v) => { const x = num(v.rate, -1); if (x < 0) throw new Error(t('err.qty')); return x; } });
    if (r !== null && r !== undefined) { l.rate = r; draw(); }
  });
  m.$el.on('click', '[data-a=disc]', async function () {
    const r = await UI.formModal({ title: t('sh.discount'), body: `<input name="d" class="form-control form-control-lg text-center" inputmode="decimal" dir="ltr" value="${st.cart.discount || ''}" placeholder="0">`, onSubmit: (v) => num(v.d) });
    if (r !== null && r !== undefined) { st.cart.discount = r; delete st.cart.tendered; draw(); }
  });
  m.$el.on('click', '[data-pay]', function () { st.cart.pay = this.dataset.pay; delete st.cart.tendered; draw(); });
  m.$el.on('change', 'input[data-a=tender]', function () { st.cart.tendered = num(this.value); draw(); });
  m.$el.on('click', '[data-a=cust]', async () => {
    const pick = await UI.pick({ title: t('sh.pickCustomer'), placeholder: t('search'),
      search: (q) => Catalog.searchParties('customers', q, 40).map((c) => ({ id: c.id, title: c.name, subtitle: c.milk?.area || c.phone || '', value: c })),
      addNew: { label: t('cu.add'), create: () => D.customerForm().then((c) => c && { id: c.id, value: c }) } });
    if (pick?.value) { st.cart.customerId = pick.value.id; draw(); }
  });
  m.$el.on('click', '[data-a=save]', async function () {
    const sub = total(); const disc = Math.min(sub, Math.max(0, num(st.cart.discount))); const due = round2(sub - disc);
    const credit = st.cart.pay === 'credit';
    if (credit && !st.cart.customerId) { UI.toast(t('sh.needCustomer'), 'warning'); return; }
    const tendered = st.cart.tendered === undefined ? (credit ? 0 : due) : num(st.cart.tendered);
    if (!credit && tendered < due - 0.001) { UI.toast(t('sh.needCash'), 'warning'); return; }
    $(this).prop('disabled', true);
    try {
      const { doc } = await Posting.saveSale({ id: st.cart.id, customerId: credit ? st.cart.customerId : null, tendered: credit ? tendered : tendered,
        discount: disc, items: st.cart.lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate, name: Catalog.product(l.productId)?.name })) });
      st.cart = newCart(); saveCart();
      $c.html(`${UI.doneTick()}<div class="text-center fs-3 fw-bold mb-1">${esc(t('sh.saved'))}</div><div class="text-center text-body-secondary mb-3">${esc(doc.number)} · ${esc(cur())} ${fmtMoney(doc.total)}</div>
        <div class="d-grid gap-2"><button class="btn btn-primary btn-lg" data-a="print"><i class="bi bi-printer-fill"></i>${esc(t('act.print'))}</button><button class="btn btn-light btn-lg" data-a="close">${esc(t('sh.newSale'))}</button></div>`);
      m.$el.on('click', '[data-a=print]', () => D.printDoc('sale', doc));
      m.$el.on('click', '[data-a=close]', () => m.close());
      drawTiles(); drawToday();
    } catch (e) { UI.toastError(e); $(this).prop('disabled', false); }
  });
  m.closed.then(() => { if (st) drawTiles(); });
}

// ---------- today's sales ----------
async function drawToday() {
  const all = await idb.getAllByIndex('sales', 'date', IDBKeyRange.only(today()));
  const list = all.filter((s) => s.status !== 'void' && !s.bill).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sum = list.reduce((s, x) => s + x.total, 0);
  $(st.root).find('#sh-today').html(`<div class="section-title"><i class="bi bi-clock-history"></i>${esc(t('sh.today'))} <span class="ms-auto money">${esc(cur())} ${fmtMoney(sum)}</span></div>
    <div class="list-card">${list.length ? list.slice(0, 15).map((s) => `<div class="list-row" data-id="${esc(s.id)}"><div class="grow"><div class="t">${esc(s.customerName)}</div><div class="s">${esc(fmtTime(s.createdAt))} · ${esc(s.number)}${s.balance > 0 ? ` · <span class="text-bad">${esc(t('sh.credit'))}</span>` : ''}</div></div>
      <div class="money">${esc(cur())} ${fmtMoney(s.total)}</div><button class="btn btn-light btn-sm" data-a="print"><i class="bi bi-printer-fill"></i></button><button class="btn btn-light btn-sm text-danger" data-a="void"><i class="bi bi-trash3"></i></button></div>`).join('') : UI.emptyState(t('sh.noSales'), 'basket')}</div>`);
}

export default {
  async render(root) {
    const saved = pref.get('shopCart');
    st = { root, q: '', cart: saved?.id && Array.isArray(saved.lines) ? saved : newCart() };
    st.cart.lines = st.cart.lines.filter((l) => Catalog.product(l.productId));
    root.innerHTML = `
      <div class="page-header"><h1 class="dup">${esc(t('nav.shop'))}</h1></div>
      ${Catalog.allProducts().length > 10 ? `<div class="search-box mb-3"><i class="bi bi-search"></i><input type="search" id="sh-q" class="form-control" placeholder="${esc(t('search'))}" autocomplete="off"></div>` : ''}
      <div class="product-grid stagger" id="sh-grid"></div>
      <div id="sh-today" class="mb-5"></div>
      <div id="sh-bar" class="cart-bar d-none"><div class="tot"><div class="c small text-body-secondary"></div><div class="v"></div></div><button class="btn btn-success btn-lg" id="sh-go"><i class="bi bi-cart-check-fill"></i>${esc(t('sh.checkout'))}</button></div>`;
    drawTiles(); drawToday();
    const $r = $(root);
    $r.on('click', '.product-tile', function () { addProduct(this.dataset.id); });
    $r.on('input', '#sh-q', function () { st.q = this.value; drawTiles(); });
    $r.on('click', '#sh-go', checkout);
    $r.on('click', '#sh-today [data-a]', async function () {
      const id = $(this).closest('[data-id]').data('id');
      if (this.dataset.a === 'print') return D.printDoc('sale', await idb.get('sales', id));
      if (!await UI.confirmDialog(t('sh.voidAsk'), { title: t('act.delete'), okLabel: t('act.delete'), okClass: 'btn-danger' })) return;
      try { await Posting.voidDocument('sale', id, 'deleted at counter'); UI.toast(t('deleted')); drawToday(); } catch (e) { UI.toastError(e); }
    });
  },
  destroy() { st = null; },
};
