// Daily delivery sheet: one big card per house, one tap to mark the milk as delivered.
import * as UI from '../core/ui.js';
import { esc, fmtQty, fmtMoney, today, num, round3 } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { dayLabel, cur, unitLabel } from '../core/views.js';
import * as Catalog from '../services/catalog.js';
import * as Milk from '../services/milk.js';

const $ = window.jQuery;

let st = null;

const productUnit = (c) => Catalog.product(c.milk.productId)?.unit || 'L';

function houseHtml(r) {
  const c = r.customer; const rec = r.rec;
  const cls = rec?.status === 'done' ? 'done' : rec?.status === 'skip' ? 'skip' : '';
  const q = rec?.status === 'done' ? rec.qty : r.planned;
  const changed = rec?.status === 'done' && r.planned && rec.qty !== r.planned;
  const sub = [c.milk.area, c.address].filter(Boolean).join(' · ');
  let acts;
  if (rec?.billId) acts = `<span class="chip"><i class="bi bi-lock-fill"></i>${esc(t('dl.billed'))}</span>`;
  else if (!rec) acts = `<div class="acts"><button class="act no" data-a="skip" aria-label="${esc(t('dl.skip'))}"><i class="bi bi-x-lg"></i></button><button class="act yes" data-a="yes" aria-label="${esc(t('dl.done'))}"><i class="bi bi-check-lg"></i></button></div>`;
  else acts = `<div class="acts"><button class="act undo" data-a="undo" aria-label="${esc(t('dl.undo'))}"><i class="bi bi-arrow-counterclockwise"></i></button></div>`;
  const stamp = rec?.status === 'done' ? `<svg class="tick stamp" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16" fill="#16a34a"/><path d="M9 18 l6 6 l11 -12" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : '';
  return `<div class="house ${cls} ${st.just === c.id ? 'just' : ''}" data-id="${esc(c.id)}">
    ${UI.avatar(c.name)}
    <div class="who"><div class="nm text-truncate">${esc(c.name)}</div><div class="ad text-truncate">${rec?.status === 'skip' ? `<span class="chip bad">${esc(t('dl.skipped'))}</span> ` : ''}${esc(sub || ' ')}${changed ? ` · <span class="text-warn">${esc(t('dl.changed', { n: fmtQty(r.planned) }))}</span>` : ''}</div></div>
    ${rec?.status === 'skip' ? '' : `<button class="qty" data-a="qty" ${rec?.billId ? 'disabled' : ''}>${fmtQty(q)}<small>${esc(unitLabel(productUnit(c)))}</small></button>`}
    ${acts}${stamp}</div>`;
}

async function load() {
  st.rows = await Milk.daySheet(st.date, st.shift);
}

function drawList() {
  const q = st.q.trim().toLowerCase();
  const rows = st.rows.filter((r) => (!st.area || r.customer.milk.area === st.area) && (!q || `${r.customer.name} ${r.customer.phone || ''} ${r.customer.milk.area || ''}`.toLowerCase().includes(q)));
  const all = st.rows;
  const done = all.filter((r) => r.rec).length;
  const litres = all.reduce((s, r) => s + (r.rec?.status === 'done' ? r.rec.qty : 0), 0);
  const pending = all.filter((r) => !r.rec && r.planned > 0).length;
  $(st.root).find('#dl-progress').html(`<div class="d-flex justify-content-between align-items-end mb-1"><div class="fw-bold fs-5">${esc(t('home.houses', { a: done, b: all.length }))}</div><div class="text-body-secondary">${fmtQty(litres)} ${esc(t('unit.L'))}</div></div>
    <div class="progress-line"><i style="width:${all.length ? Math.round((done / all.length) * 100) : 0}%"></i></div>`);
  $(st.root).find('#dl-all').toggleClass('d-none', !pending).find('.n').text(pending);
  $(st.root).find('#dl-list').html(rows.length ? rows.map(houseHtml).join('') : UI.emptyState(all.length ? t('empty.nomatch') : t('dl.empty'), 'bicycle'));
  st.just = null;
}

function drawChrome() {
  const areas = Milk.areas();
  const isToday = st.date === today();
  $(st.root).find('#dl-date').html(`<button class="btn btn-light" data-a="prev" aria-label="prev"><i class="bi bi-chevron-left"></i></button>
    <label class="btn btn-light flex-grow-1 position-relative mb-0 fw-bold">${isToday ? `<span class="chip ok me-1">${esc(t('date.today'))}</span>` : ''}${esc(dayLabel(st.date))}
      <input type="date" id="dl-pick" value="${st.date}" max="${Milk.addDays(today(), 7)}" style="position:absolute;inset:0;opacity:0;width:100%"></label>
    <button class="btn btn-light" data-a="next" aria-label="next"><i class="bi bi-chevron-right"></i></button>`);
  $(st.root).find('#dl-seg button').each(function () { $(this).toggleClass('active', this.dataset.s === st.shift); });
  $(st.root).find('#dl-areas').html(areas.length > 1 ? `<button class="pill ${st.area ? '' : 'active'}" data-area="">${esc(t('dl.allAreas'))}</button>${areas.map((a) => `<button class="pill ${st.area === a ? 'active' : ''}" data-area="${esc(a)}">${esc(a)}</button>`).join('')}` : '');
}

async function refresh() { await load(); drawList(); }

async function setStatus(id, status, qty) {
  try {
    await Milk.setDelivery(id, st.date, st.shift, status, qty);
    st.just = id;
    await refresh();
    if (status === 'done') { const el = st.root.querySelector(`.house[data-id="${CSS.escape(id)}"] .tick`); if (el) UI.confetti(el); if (navigator.vibrate) navigator.vibrate(25); }
  } catch (e) { UI.toastError(e); }
}

function qtyDialog(r) {
  const c = r.customer;
  const start = r.rec?.status === 'done' ? r.rec.qty : r.planned || 1;
  return UI.formModal({
    title: c.name, submitLabel: t('act.save'), submitClass: 'btn-success btn-lg',
    body: `<div class="text-center mb-2 text-body-secondary">${esc(t('dl.howmuch'))} (${esc(unitLabel(productUnit(c)))})</div>
      <div class="text-center mb-3"><div class="stepper"><button type="button" data-d="1">+</button><input name="qty" inputmode="decimal" dir="ltr" value="${start}" aria-label="qty"><button type="button" data-d="-1">−</button></div></div>
      <div class="quick-qty justify-content-center mb-2">${[0.5, 1, 1.5, 2, 3, 5].map((v) => `<button type="button" class="btn btn-light" data-q="${v}">${v}</button>`).join('')}</div>
      <div class="text-center small text-body-secondary">${esc(t('dl.rate'))}: <b>${cur()} ${fmtMoney(num(c.milk.rate))}</b></div>`,
    onShown: (m) => {
      const $i = m.find('[name=qty]');
      const set = (v) => $i.val(String(Math.max(0, round3(v))));
      m.on('click', '[data-d]', function () { set(num($i.val()) + 0.5 * +this.dataset.d); });
      m.on('click', '[data-q]', function () { set(+this.dataset.q); });
    },
    onSubmit: async (v) => {
      const q = num(v.qty);
      if (!(q > 0)) throw new Error(t('err.qty'));
      await Milk.setDelivery(c.id, st.date, st.shift, 'done', q);
      st.just = c.id; return true;
    },
  });
}

async function addExtra() {
  const have = new Set(st.rows.map((r) => r.customer.id));
  const list = Catalog.allParties('customers').filter((c) => c.active !== 0 && c.milk && !have.has(c.id));
  if (!list.length) { UI.toast(t('dl.noExtra'), 'info'); return; }
  const pick = await UI.pick({ title: t('dl.extra'), placeholder: t('search'),
    search: (q) => list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40).map((c) => ({ id: c.id, title: c.name, subtitle: c.milk.area || c.phone || '', value: c })) });
  if (!pick) return;
  const r = { customer: pick.value, planned: 0, rec: null };
  if (await qtyDialog(r)) await refresh();
}

export default {
  async render(root, ctx) {
    const first = ctx.params[0];
    st = { root, date: today(), shift: first === 'm' || first === 'e' ? first : Milk.shiftOfNow(), area: '', q: '', rows: [], just: null };
    root.innerHTML = `
      <div class="d-flex gap-2 mb-2" id="dl-date"></div>
      <div class="seg mb-3" id="dl-seg"><button class="m" data-s="m"><i class="bi bi-sunrise-fill"></i>${esc(t('shift.m'))}</button><button class="e" data-s="e"><i class="bi bi-moon-stars-fill"></i>${esc(t('shift.e'))}</button></div>
      <div class="card p-3 mb-3"><div id="dl-progress"></div>
        <button class="btn btn-success btn-lg w-100 mt-3 d-none" id="dl-all"><i class="bi bi-check2-all"></i>${esc(t('dl.markAll'))} (<span class="n"></span>)</button></div>
      <div class="chips" id="dl-areas"></div>
      <div class="search-box mb-3"><i class="bi bi-search"></i><input type="search" class="form-control" id="dl-q" placeholder="${esc(t('search'))}" autocomplete="off"></div>
      <div id="dl-list"></div>
      <button class="btn btn-light w-100 mt-3" id="dl-extra"><i class="bi bi-plus-circle"></i>${esc(t('dl.extra'))}</button>`;
    const $r = $(root);
    drawChrome();
    await refresh();
    const redraw = async () => { drawChrome(); await refresh(); };

    $r.on('click', '#dl-seg button', async function () { st.shift = this.dataset.s; await redraw(); });
    $r.on('click', '#dl-date [data-a=prev]', async () => { st.date = Milk.addDays(st.date, -1); await redraw(); });
    $r.on('click', '#dl-date [data-a=next]', async () => { st.date = Milk.addDays(st.date, 1); await redraw(); });
    $r.on('change', '#dl-pick', async function () { if (this.value) { st.date = this.value; await redraw(); } });
    $r.on('click', '#dl-areas [data-area]', async function () { st.area = this.dataset.area; drawChrome(); drawList(); });
    $r.on('input', '#dl-q', function () { st.q = this.value; drawList(); });
    $r.on('click', '#dl-extra', addExtra);
    $r.on('click', '#dl-all', async () => {
      const n = st.rows.filter((r) => !r.rec && r.planned > 0).length;
      if (!await UI.confirmDialog(t('dl.markAllAsk', { n }), { title: t('dl.markAll'), okLabel: t('dl.markAll'), okClass: 'btn-success' })) return;
      await UI.withLoading(() => Milk.markAll(st.date, st.shift, st.rows));
      UI.toast(t('dl.allDone')); await refresh();
    });
    $r.on('click', '.house [data-a]', async function () {
      const id = $(this).closest('.house').data('id');
      const r = st.rows.find((x) => x.customer.id === id);
      const a = this.dataset.a;
      if (a === 'yes') await setStatus(id, 'done', r.planned);
      else if (a === 'skip') await setStatus(id, 'skip');
      else if (a === 'undo') await setStatus(id, null);
      else if (a === 'qty' && await qtyDialog(r)) await refresh();
    });
  },
  destroy() { st = null; },
};
