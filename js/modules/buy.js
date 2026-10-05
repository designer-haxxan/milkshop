// Milk purchase (دودھ خرید): record milk bought from farmers/suppliers and pay them.
import * as UI from '../core/ui.js';
import { esc, fmtMoney, fmtQty, uuid, num, round2, fmtDate } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { cur, unitLabel, productEmoji } from '../core/views.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as Milk from '../services/milk.js';
import * as idb from '../db/idb.js';
import * as D from './dialogs.js';

const $ = window.jQuery;
let st = null;

const fresh = () => ({ id: uuid(), supplierId: '', productId: Milk.milkProductId() || Catalog.allProducts()[0]?.id || '' });

async function drawBuy() {
  const $b = $(st.root).find('#tab');
  const prods = Catalog.allProducts().filter((p) => p.active);
  const sup = st.form.supplierId ? Catalog.party('suppliers', st.form.supplierId) : null;
  const p = Catalog.product(st.form.productId);
  const recent = (await idb.getAll('purchases')).filter((x) => x.status !== 'void').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  $b.html(`
    <div class="card p-3 mb-3">
      <button class="btn btn-light w-100 py-3 mb-3" id="by-sup"><i class="bi bi-truck"></i> ${sup ? `<b>${esc(sup.name)}</b>` : esc(t('by.pickSupplier'))}</button>
      <div class="chips flex-wrap" style="flex-wrap:wrap">${prods.map((x) => `<button class="pill ${x.id === st.form.productId ? 'active' : ''}" data-p="${esc(x.id)}">${productEmoji(x)} ${esc(x.name)}</button>`).join('')}</div>
      <div class="row g-3 mt-1">
        <div class="col-6"><label class="form-label">${esc(t('by.qty'))} (${esc(unitLabel(p?.unit))})</label><input id="by-qty" class="form-control form-control-lg text-center" inputmode="decimal" dir="ltr"></div>
        <div class="col-6"><label class="form-label">${esc(t('by.rate'))}</label><input id="by-rate" class="form-control form-control-lg text-center" inputmode="decimal" dir="ltr" value="${p?.purchasePrice || ''}"></div>
      </div>
      <div class="checkout-total my-2" id="by-total">${esc(cur())} 0</div>
      <div class="mb-3"><label class="form-label">${esc(t('by.paid'))}</label><input id="by-paid" class="form-control form-control-lg text-center" inputmode="decimal" dir="ltr" placeholder="0"></div>
      <div class="small text-body-secondary mb-3" id="by-hint"></div>
      <button class="btn btn-success btn-lg w-100" id="by-save"><i class="bi bi-check-lg"></i>${esc(t('by.save'))}</button>
    </div>
    <div class="section-title"><i class="bi bi-clock-history"></i>${esc(t('by.recent'))}</div>
    <div class="list-card">${recent.length ? recent.map((x) => `<div class="list-row" data-id="${esc(x.id)}"><div class="grow"><div class="t">${esc(x.supplierName)}</div><div class="s">${esc(fmtDate(x.date))} · ${fmtQty(x.qtyTotal)}${x.balance > 0 ? ` · <span class="text-bad">${esc(t('by.owed'))} ${fmtMoney(x.balance)}</span>` : ''}</div></div>
      <div class="money">${esc(cur())} ${fmtMoney(x.total)}</div><button class="btn btn-light btn-sm text-danger" data-a="void"><i class="bi bi-trash3"></i></button></div>`).join('') : UI.emptyState(t('by.empty'), 'truck')}</div>`);
  recalc();
}

function recalc() {
  const $r = $(st.root);
  const total = round2(num($r.find('#by-qty').val()) * num($r.find('#by-rate').val()));
  $r.find('#by-total').text(`${cur()} ${fmtMoney(total)}`);
  const paid = $r.find('#by-paid').val() === '' ? total : num($r.find('#by-paid').val());
  $r.find('#by-hint').text(paid < total ? t('by.willOwe', { n: `${cur()} ${fmtMoney(total - paid)}` }) : '');
}

async function drawSuppliers() {
  const bals = await Milk.supplierBalances();
  const list = Catalog.allParties('suppliers').filter((s) => s.active !== 0).sort((a, b) => a.name.localeCompare(b.name, 'ur'));
  $(st.root).find('#tab').html(`<button class="btn btn-success w-100 mb-3" id="su-add"><i class="bi bi-plus-circle-fill"></i>${esc(t('su.add'))}</button>
    <div class="list-card">${list.length ? list.map((s) => { const b = bals.get(s.id) || 0; return `<div class="list-row" data-id="${esc(s.id)}">${UI.avatar(s.name)}<div class="grow"><div class="t">${esc(s.name)}</div><div class="s">${esc(s.phone || '')}</div></div>
      ${b > 0.5 ? `<span class="chip bad">${esc(t('by.owed'))} ${esc(cur())} ${fmtMoney(b)}</span><button class="btn btn-primary btn-sm" data-a="pay"><i class="bi bi-cash-coin"></i></button>` : `<span class="chip ok">${esc(t('bal.clear'))}</span>`}
      <button class="btn btn-light btn-sm" data-a="edit"><i class="bi bi-pencil-fill"></i></button></div>`; }).join('') : UI.emptyState(t('su.empty'), 'truck')}</div>`);
}

async function show() { $(st.root).find('#seg button').each(function () { $(this).toggleClass('active', this.dataset.t === st.tab); }); await (st.tab === 'buy' ? drawBuy() : drawSuppliers()); }

export default {
  async render(root) {
    st = { root, tab: 'buy', form: fresh() };
    root.innerHTML = `<div class="page-header"><h1 class="dup">${esc(t('nav.buy'))}</h1></div>
      <div class="seg mb-3" id="seg"><button data-t="buy" class="active"><i class="bi bi-basket2-fill"></i>${esc(t('by.tabBuy'))}</button><button data-t="sup"><i class="bi bi-people-fill"></i>${esc(t('by.tabSup'))}</button></div><div id="tab"></div>`;
    await show();
    const $r = $(root);
    $r.on('click', '#seg button', async function () { st.tab = this.dataset.t; await show(); });
    $r.on('input', '#by-qty, #by-rate, #by-paid', recalc);
    $r.on('click', '[data-p]', function () { st.form.productId = this.dataset.p; $r.find('[data-p]').removeClass('active'); $(this).addClass('active'); const p = Catalog.product(this.dataset.p); $r.find('#by-rate').val(p?.purchasePrice || ''); recalc(); });
    $r.on('click', '#by-sup', async () => {
      const pick = await UI.pick({ title: t('by.pickSupplier'), placeholder: t('search'), noneLabel: t('by.cash'),
        search: (q) => Catalog.searchParties('suppliers', q, 40).map((s) => ({ id: s.id, title: s.name, subtitle: s.phone || '', value: s })),
        addNew: { label: t('su.add'), create: () => D.supplierForm().then((s) => s && { id: s.id, value: s }) } });
      if (pick === undefined) return;
      st.form.supplierId = pick?.value?.id || '';
      const keepQ = $r.find('#by-qty').val(); const keepR = $r.find('#by-rate').val(); const keepP = $r.find('#by-paid').val();
      await drawBuy(); $r.find('#by-qty').val(keepQ); $r.find('#by-rate').val(keepR); $r.find('#by-paid').val(keepP); recalc();
    });
    $r.on('click', '#by-save', async function () {
      const qty = num($r.find('#by-qty').val()); const rate = num($r.find('#by-rate').val());
      const total = round2(qty * rate); const paidRaw = $r.find('#by-paid').val(); const paid = paidRaw === '' ? total : num(paidRaw);
      try {
        if (!(qty > 0) || !(rate > 0)) throw new Error(t('by.errQR'));
        if (paid < total && !st.form.supplierId) throw new Error(t('by.errSupplier'));
        $(this).prop('disabled', true);
        await Posting.savePurchase({ id: st.form.id, supplierId: st.form.supplierId || null, tendered: Math.min(paid, total), items: [{ productId: st.form.productId, qty, rate, name: Catalog.product(st.form.productId)?.name }] });
        UI.toast(t('saved')); st.form = { ...fresh(), supplierId: st.form.supplierId }; await drawBuy();
      } catch (e) { UI.toastError(e); $(this).prop('disabled', false); }
    });
    $r.on('click', '#tab [data-a]', async function () {
      const id = $(this).closest('[data-id]').data('id'); const a = this.dataset.a;
      try {
        if (a === 'void') {
          if (!await UI.confirmDialog(t('by.voidAsk'), { title: t('act.delete'), okLabel: t('act.delete'), okClass: 'btn-danger' })) return;
          await Posting.voidDocument('purchase', id, 'deleted'); UI.toast(t('deleted')); await show();
        } else if (a === 'pay') { const bals = await Milk.supplierBalances(); if (await D.payDialog(Catalog.party('suppliers', id), bals.get(id) || 0)) await show(); }
        else if (a === 'edit') { if (await D.supplierForm(Catalog.party('suppliers', id))) await show(); }
      } catch (e) { UI.toastError(e); }
    });
    $r.on('click', '#su-add', async () => { if (await D.supplierForm()) await show(); });
  },
  destroy() { st = null; },
};
