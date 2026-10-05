// Customers (گاہک): list with balances, and a detail page per house with calendar, bills and payments.
import * as UI from '../core/ui.js';
import { esc, fmtMoney, fmtQty, fmtDate, today, num, round3 } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { cur, balChip, monthLabel, pager } from '../core/views.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as Milk from '../services/milk.js';
import * as D from './dialogs.js';

const $ = window.jQuery;
let alive = false;

// ================= list =================
async function renderList(root) {
  const bals = await Milk.customerBalances();
  const st = { q: '', area: '', due: false };
  root.innerHTML = `
    <div class="page-header"><h1 class="dup">${esc(t('nav.customers'))}</h1><button class="btn btn-success" id="cu-add"><i class="bi bi-person-plus-fill"></i>${esc(t('cu.add'))}</button></div>
    <div class="search-box mb-2"><i class="bi bi-search"></i><input type="search" class="form-control" id="cu-q" placeholder="${esc(t('search'))}" autocomplete="off"></div>
    <div class="chips" id="cu-chips"></div>
    <div class="list-card" id="cu-list"></div>`;
  const $r = $(root);
  const chips = () => {
    const areas = Milk.areas();
    $r.find('#cu-chips').html(`<button class="pill ${!st.area && !st.due ? 'active' : ''}" data-f="all">${esc(t('dl.allAreas'))}</button>
      <button class="pill ${st.due ? 'active' : ''}" data-f="due">${esc(t('cu.onlyDue'))}</button>${areas.map((a) => `<button class="pill ${st.area === a ? 'active' : ''}" data-area="${esc(a)}">${esc(a)}</button>`).join('')}`);
  };
  const draw = () => {
    const q = st.q.trim().toLowerCase();
    const list = Catalog.allParties('customers').filter((c) => c.active !== 0)
      .filter((c) => (!st.area || c.milk?.area === st.area) && (!st.due || (bals.get(c.id)?.total || 0) > 0.5) && (!q || `${c.name} ${c.phone || ''} ${c.milk?.area || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ur'));
    pager($r.find('#cu-list'), list, (c) => {
      const b = bals.get(c.id) || { total: 0 };
      const plan = c.milk ? [num(c.milk.morning) ? `${t('shift.m')} ${fmtQty(c.milk.morning)}` : '', num(c.milk.evening) ? `${t('shift.e')} ${fmtQty(c.milk.evening)}` : ''].filter(Boolean).join(' · ') : t('cu.shopOnly');
      return `<a href="#/customers/${encodeURIComponent(c.id)}" class="list-row">${UI.avatar(c.name)}
        <div class="grow"><div class="t text-truncate">${esc(c.name)}</div><div class="s text-truncate">${esc([c.milk?.area, plan].filter(Boolean).join(' · '))}</div></div>
        <div class="text-end">${balChip(b.total)}</div><i class="bi bi-chevron-right text-body-secondary"></i></a>`;
    }, 40, UI.emptyState(t('cu.empty'), 'people'));
  };
  chips(); draw();
  $r.on('input', '#cu-q', function () { st.q = this.value; draw(); });
  $r.on('click', '#cu-chips [data-f]', function () { st.due = this.dataset.f === 'due'; st.area = ''; chips(); draw(); });
  $r.on('click', '#cu-chips [data-area]', function () { st.area = this.dataset.area; st.due = false; chips(); draw(); });
  $r.on('click', '#cu-add', async () => { const c = await D.customerForm(); if (c) { location.hash = `#/customers/${encodeURIComponent(c.id)}`; } });
}

// ================= detail =================
function dayDialog(c, date, recs) {
  const byShift = Object.fromEntries(recs.map((r) => [r.shift, r]));
  const row = (s) => {
    const rec = byShift[s]; const planned = Milk.plannedQty(c, date, s);
    const status = rec?.status || ''; const qty = rec?.status === 'done' ? rec.qty : planned || 1;
    const locked = !!rec?.billId;
    return `<div class="p-3 mb-3 rounded-4" style="background:var(--bs-secondary-bg)" data-s="${s}">
      <div class="fw-bold mb-2"><i class="bi bi-${s === 'm' ? 'sunrise-fill text-warn' : 'moon-stars-fill'}" ${s === 'e' ? 'style="color:#6366f1"' : ''}></i> ${esc(t('shift.' + s))} ${planned ? `<span class="chip">${esc(t('cd.plan'))} ${fmtQty(planned)}</span>` : ''} ${locked ? `<span class="chip"><i class="bi bi-lock-fill"></i>${esc(t('dl.billed'))}</span>` : ''}</div>
      <div class="seg mb-2"><button type="button" data-v="done" class="${status === 'done' ? 'active' : ''}" ${locked ? 'disabled' : ''}>✔ ${esc(t('dl.done'))}</button><button type="button" data-v="skip" class="${status === 'skip' ? 'active' : ''}" ${locked ? 'disabled' : ''}>✖ ${esc(t('dl.skipped'))}</button><button type="button" data-v="" class="${status === '' ? 'active' : ''}" ${locked ? 'disabled' : ''}>— ${esc(t('cd.none'))}</button></div>
      <input type="hidden" name="st-${s}" value="${status}">
      <div class="text-center"><div class="stepper"><button type="button" data-d="1" ${locked ? 'disabled' : ''}>+</button><input name="q-${s}" inputmode="decimal" dir="ltr" value="${qty}" ${locked ? 'disabled' : ''}><button type="button" data-d="-1" ${locked ? 'disabled' : ''}>−</button></div></div></div>`;
  };
  return UI.formModal({
    title: `${c.name} — ${fmtDate(date)}`, submitLabel: t('act.save'), submitClass: 'btn-success btn-lg',
    body: row('m') + row('e'),
    onShown: (el) => {
      el.on('click', '.seg [data-v]', function () { const box = $(this).closest('[data-s]'); box.find('.seg button').removeClass('active'); $(this).addClass('active'); box.find('[type=hidden]').val(this.dataset.v); });
      el.on('click', '[data-d]', function () { const i = $(this).closest('[data-s]').find('.stepper input'); i.val(Math.max(0, round3(num(i.val()) + 0.5 * +this.dataset.d))); });
    },
    onSubmit: async (v) => {
      for (const s of ['m', 'e']) {
        const old = byShift[s]; if (old?.billId) continue;
        const status = v['st-' + s] || null; const qty = num(v['q-' + s]);
        if ((old?.status || null) === status && (status !== 'done' || old.qty === qty)) continue;
        await Milk.setDelivery(c.id, date, s, status, qty);
      }
      return true;
    },
  });
}

function holidayDialog(c) {
  const m = c.milk;
  return UI.formModal({
    title: `${t('cd.holiday')} — ${c.name}`, submitLabel: t('act.save'), submitClass: 'btn-success btn-lg',
    body: `<div class="help-card mb-3"><i class="bi bi-info-circle-fill fs-4"></i><div>${esc(t('cd.holidayHelp'))}</div></div>
      <div class="row g-3"><div class="col-6"><label class="form-label">${esc(t('cd.from'))}</label><input type="date" name="from" class="form-control" dir="ltr" value="${esc(m.pauseFrom || today())}"></div>
      <div class="col-6"><label class="form-label">${esc(t('cd.to'))}</label><input type="date" name="to" class="form-control" dir="ltr" value="${esc(m.pauseTo || '')}"></div></div>
      ${m.pauseFrom ? `<button type="button" class="btn btn-light w-100 mt-3" id="hol-clear"><i class="bi bi-play-fill"></i>${esc(t('cd.resume'))}</button>` : ''}`,
    onShown: (el) => el.on('click', '#hol-clear', async () => { await Posting.saveParty('customers', { ...c, id: c.id, openingBalance: c.openingBalance, milk: { ...m, pauseFrom: '', pauseTo: '' } }); el.find('.btn-close').trigger('click'); UI.toast(t('saved')); }),
    onSubmit: async (v) => { await Posting.saveParty('customers', { ...c, id: c.id, openingBalance: c.openingBalance, milk: { ...m, pauseFrom: v.from, pauseTo: v.to } }); UI.toast(t('saved')); return true; },
  });
}

async function renderDetail(root, id) {
  const c = Catalog.party('customers', id);
  if (!c) { root.innerHTML = UI.emptyState(t('err.notfound'), 'person-x'); return; }
  const st = { month: Milk.monthOf() };
  const $r = $(root);

  async function draw() {
    const [bals, recs, bills, led] = await Promise.all([Milk.customerBalances(), Milk.monthRecords(c.id, st.month), Milk.billsOfCustomer(c.id), Posting.ledger(Posting.partyAccount('customers', c.id), '2000-01-01', '9999-12-31')]);
    const b = bals.get(c.id) || { billed: 0, unbilled: 0, total: 0 };
    const cc = Catalog.party('customers', id);
    const cls = b.total > 0.5 ? 'due' : 'clear';
    const byDate = {};
    for (const r of recs) (byDate[r.date] ||= []).push(r);
    const [y, mo] = st.month.split('-').map(Number);
    const first = new Date(y, mo - 1, 1).getDay(); const days = new Date(y, mo, 0).getDate();
    const dows = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(t('locale'), { weekday: 'short' }));
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<div class="day blank"></div>';
    for (let d = 1; d <= days; d++) {
      const date = `${st.month}-${String(d).padStart(2, '0')}`; const rs = byDate[date] || [];
      const lit = rs.filter((r) => r.status === 'done').reduce((s, r) => s + r.qty, 0);
      const skip = rs.some((r) => r.status === 'skip') && !lit;
      cells += `<button class="day ${lit ? 'has' : ''} ${skip ? 'skip' : ''} ${date === today() ? 'today' : ''} ${rs.length && rs.every((r) => r.billId) ? 'billed' : ''}" data-date="${date}">${d}${lit ? `<small>${fmtQty(lit)}</small>` : skip ? '<small>✖</small>' : ''}</button>`;
    }
    const monthLit = recs.filter((r) => r.status === 'done').reduce((s, r) => s + r.qty, 0);
    const monthAmt = recs.filter((r) => r.status === 'done').reduce((s, r) => s + r.amount, 0);
    const m = cc.milk;
    const hol = m?.pauseFrom && (!m.pauseTo || m.pauseTo >= today());

    $r.html(`
      <div class="page-header"><a href="#/customers" class="btn btn-light" aria-label="back"><i class="bi bi-arrow-left"></i></a><h1 class="text-truncate">${esc(cc.name)}</h1><button class="btn btn-light" id="cd-edit"><i class="bi bi-pencil-fill"></i></button></div>
      <div class="bal-box ${cls} mb-3">
        <div>${esc(t(b.total > 0.5 ? 'cd.totalDue' : b.total < -0.5 ? 'bal.advance' : 'bal.clear'))}</div>
        <div class="big"><span data-count="${Math.abs(b.total)}">0</span></div>
        <div class="d-flex gap-3 flex-wrap small mt-1"><span>${esc(t('cd.billedPart'))}: ${esc(cur())} ${fmtMoney(b.billed)}</span><span>${esc(t('cd.unbilledPart'))}: ${esc(cur())} ${fmtMoney(b.unbilled)}</span></div>
      </div>
      <div class="act-row mb-3">
        <button class="btn btn-success" id="cd-receive"><i class="bi bi-cash-coin fs-4"></i>${esc(t('money.receive'))}</button>
        <button class="btn btn-primary" id="cd-bill" ${b.unbilled > 0 ? '' : 'disabled'}><i class="bi bi-receipt-cutoff fs-4"></i>${esc(t('cd.makeBill'))}</button>
        ${cc.phone ? `<a class="btn btn-light" href="tel:${esc(cc.phone)}"><i class="bi bi-telephone-fill fs-4 text-success"></i>${esc(t('cd.call'))}</a>` : ''}
        ${m ? `<button class="btn btn-light" id="cd-hol"><i class="bi bi-pause-circle-fill fs-4 text-warn"></i>${esc(t('cd.holiday'))}</button>` : ''}
      </div>
      ${hol ? `<div class="help-card mb-3"><i class="bi bi-pause-circle-fill fs-3 text-warn"></i><div><b>${esc(t('cd.onHoliday'))}</b><div class="small">${esc(fmtDate(m.pauseFrom))} → ${m.pauseTo ? esc(fmtDate(m.pauseTo)) : '…'}</div></div></div>` : ''}
      ${m ? `<div class="card p-3 mb-3"><div class="d-flex flex-wrap gap-2">
        <span class="chip"><i class="bi bi-sunrise-fill"></i>${esc(t('shift.m'))} ${fmtQty(m.morning)} ${esc(t('unit.L'))}</span><span class="chip"><i class="bi bi-moon-stars-fill"></i>${esc(t('shift.e'))} ${fmtQty(m.evening)} ${esc(t('unit.L'))}</span>
        <span class="chip ok">${esc(cur())} ${fmtMoney(m.rate)} / ${esc(t('unit.L'))}</span>${m.area ? `<span class="chip warn"><i class="bi bi-geo-alt-fill"></i>${esc(m.area)}</span>` : ''}</div>
        ${cc.address ? `<div class="mt-2 small text-body-secondary"><i class="bi bi-house-door"></i> ${esc(cc.address)}</div>` : ''}</div>
      <div class="section-title"><i class="bi bi-calendar3"></i>${esc(t('cd.calendar'))}</div>
      <div class="card p-3 mb-3">
        <div class="d-flex align-items-center gap-2 mb-2"><button class="btn btn-light" data-mn="-1"><i class="bi bi-chevron-left"></i></button><div class="flex-grow-1 text-center fw-bold fs-5">${esc(monthLabel(st.month))}</div><button class="btn btn-light" data-mn="1"><i class="bi bi-chevron-right"></i></button></div>
        <div class="cal mb-1">${dows.map((d) => `<div class="dow">${esc(d)}</div>`).join('')}</div><div class="cal">${cells}</div>
        <div class="d-flex justify-content-between mt-3 fw-bold"><span>${fmtQty(monthLit)} ${esc(t('unit.L'))}</span><span>${esc(cur())} ${fmtMoney(monthAmt)}</span></div>
        <div class="small text-body-secondary mt-1">${esc(t('cd.calHelp'))}</div></div>` : ''}
      <div class="section-title"><i class="bi bi-receipt-cutoff"></i>${esc(t('cd.bills'))}</div>
      <div class="list-card mb-3">${bills.length ? bills.slice(0, 12).map((s) => `<div class="list-row"><div class="grow"><div class="t">${esc(s.bill?.month ? monthLabel(s.bill.month) : s.number)}</div><div class="s">${esc(s.number)} · ${esc(fmtDate(s.date))}</div></div>
        <div class="money me-2">${esc(cur())} ${fmtMoney(s.total)}</div><button class="btn btn-wa btn-sm" data-wa="${esc(s.id)}"><i class="bi bi-whatsapp"></i></button><button class="btn btn-light btn-sm" data-print="${esc(s.id)}"><i class="bi bi-printer-fill"></i></button><button class="btn btn-light btn-sm text-danger" data-void="${esc(s.id)}"><i class="bi bi-trash3"></i></button></div>`).join('') : UI.emptyState(t('cd.noBills'), 'receipt')}</div>
      <div class="section-title"><i class="bi bi-journal-text"></i>${esc(t('cd.ledger'))}</div>
      <div class="list-card">${led.rows.length ? led.rows.slice().reverse().slice(0, 25).map((e) => `<div class="list-row"><div class="grow"><div class="t">${esc(t('ref.' + e.refType))}</div><div class="s">${esc(fmtDate(e.date))}${e.memo && e.memo !== t('ref.' + e.refType) ? ' · ' + esc(e.memo) : ''}</div></div>
        <div class="text-end"><div class="money ${e.credit ? 'text-ok' : ''}">${e.credit ? '−' : '+'} ${fmtMoney(e.credit || e.debit)}</div><div class="s">${esc(cur())} ${fmtMoney(e.running)}</div></div></div>`).join('') : UI.emptyState(t('cd.noLedger'), 'journal')}</div>`);
    UI.countUp(root, (v) => `${cur()} ${fmtMoney(v)}`);
  }
  await draw();

  const reload = () => { if (alive) draw(); };
  $r.on('click', '[data-mn]', function () { st.month = Milk.addMonths(st.month, +this.dataset.mn); draw(); });
  $r.on('click', '#cd-edit', async () => { if (await D.customerForm(Catalog.party('customers', id))) draw(); });
  $r.on('click', '#cd-hol', async () => { await holidayDialog(Catalog.party('customers', id)); draw(); });
  $r.on('click', '#cd-receive', async () => {
    const bals = await Milk.customerBalances();
    if (await D.receiveDialog(Catalog.party('customers', id), Math.max(0, bals.get(id)?.total || 0))) draw();
  });
  $r.on('click', '.day[data-date]', async function () {
    const date = this.dataset.date;
    if (!Catalog.party('customers', id).milk) return;
    const recs = (await Milk.monthRecords(id, st.month)).filter((r) => r.date === date);
    if (await dayDialog(Catalog.party('customers', id), date, recs)) draw();
  });
  $r.on('click', '#cd-bill', async () => {
    const pv = await Milk.previewBill(id, Milk.monthOf());
    if (!pv.ids.length) return UI.toast(t('err.nothingToBill'), 'info');
    const ok = await UI.confirmDialog(`<div class="text-center"><div class="mb-2">${esc(t('cd.billAsk', { days: pv.days, qty: fmtQty(pv.qty) }))}</div><div class="checkout-total">${esc(cur())} ${fmtMoney(pv.total)}</div></div>`,
      { title: t('cd.makeBill'), okLabel: t('cd.makeBill'), okClass: 'btn-success', html: true });
    if (!ok) return;
    try { const doc = await UI.withLoading(() => Milk.makeBill(id, Milk.monthOf())); UI.toast(t('cd.billDone', { n: doc.number })); draw(); } catch (e) { UI.toastError(e); }
  });
  $r.on('click', '[data-wa]', async function () {
    const bill = await idbSale(this.dataset.wa); const bals = await Milk.customerBalances();
    D.sendWhatsApp(Catalog.party('customers', id), await D.billText(Catalog.party('customers', id), bill, bals.get(id)?.total || 0));
  });
  $r.on('click', '[data-print]', async function () { D.printDoc('sale', await idbSale(this.dataset.print)); });
  $r.on('click', '[data-void]', async function () {
    if (!await UI.confirmDialog(t('cd.voidAsk'), { title: t('act.delete'), okLabel: t('act.delete'), okClass: 'btn-danger' })) return;
    try { await Posting.voidDocument('sale', this.dataset.void, 'bill deleted'); UI.toast(t('deleted')); draw(); } catch (e) { UI.toastError(e); }
  });
  document.addEventListener('data:changed', reload);
  renderDetail.off = () => document.removeEventListener('data:changed', reload);
}

async function idbSale(id) { return (await import('../db/idb.js')).get('sales', id); }

export default {
  async render(root, ctx) {
    alive = true;
    if (ctx.params[0]) await renderDetail(root, ctx.params[0]); else await renderList(root);
  },
  destroy() { alive = false; renderDetail.off?.(); renderDetail.off = null; },
};
