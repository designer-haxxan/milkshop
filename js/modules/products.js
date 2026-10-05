// Products (مصنوعات): milk, yogurt, lassi... with price per litre / kg / piece.
import * as UI from '../core/ui.js';
import { esc, fmtMoney, num, fmtQty } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { cur, unitLabel, productEmoji } from '../core/views.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';

const $ = window.jQuery;
let st = null;

function form(p = null) {
  const unit = p?.unit || 'L';
  return UI.formModal({
    title: p ? t('pr.edit') : t('pr.add'), submitLabel: t('act.save'), submitClass: 'btn-success btn-lg',
    body: `<div class="mb-3"><label class="form-label">${esc(t('pr.name'))}</label><input name="name" class="form-control" required value="${esc(p?.name || '')}"></div>
      <div class="mb-3"><label class="form-label">${esc(t('pr.unit'))}</label><div class="seg" id="pr-unit">${['L', 'kg', 'pcs'].map((u) => `<button type="button" data-u="${u}" class="${u === unit ? 'active' : ''}">${esc(unitLabel(u))}</button>`).join('')}</div><input type="hidden" name="unit" value="${unit}"></div>
      <div class="row g-3 mb-3"><div class="col-6"><label class="form-label">${esc(t('pr.sale'))}</label><input name="salePrice" class="form-control" inputmode="decimal" dir="ltr" value="${p?.salePrice ?? ''}" required></div>
        <div class="col-6"><label class="form-label">${esc(t('pr.buy'))}</label><input name="purchasePrice" class="form-control" inputmode="decimal" dir="ltr" value="${p?.purchasePrice || ''}"></div></div>
      <div class="form-check form-switch fs-5"><input class="form-check-input" type="checkbox" role="switch" name="trackStock" id="pr-track" ${p?.trackStock ? 'checked' : ''}><label class="form-check-label" for="pr-track">${esc(t('pr.track'))}</label></div>
      <div id="pr-open" class="mt-3"><label class="form-label">${esc(t('pr.opening'))}</label><input name="openingStock" class="form-control" inputmode="decimal" dir="ltr" value="${p?.openingStock || ''}"></div>`,
    onShown: (el) => {
      el.on('click', '#pr-unit [data-u]', function () { el.find('#pr-unit button').removeClass('active'); $(this).addClass('active'); el.find('[name=unit]').val(this.dataset.u); });
      const sync = () => el.find('#pr-open').toggle(el.find('#pr-track').prop('checked')); el.on('change', '#pr-track', sync); sync();
    },
    onSubmit: async (v) => {
      if (!(num(v.salePrice, -1) >= 0) || v.salePrice === '') throw new Error(t('pr.errPrice'));
      const rec = await Posting.saveProduct({ id: p?.id, name: v.name, unit: v.unit, salePrice: num(v.salePrice), purchasePrice: num(v.purchasePrice), trackStock: !!v.trackStock, openingStock: num(v.openingStock) });
      UI.toast(t('saved')); return rec;
    },
  });
}

function draw() {
  const list = Catalog.allProducts().filter((p) => p.active).sort((a, b) => (b.milk ? 1 : 0) - (a.milk ? 1 : 0) || a.name.localeCompare(b.name, 'ur'));
  $(st.root).find('#pr-list').html(list.length ? list.map((p) => `<button class="list-row" data-id="${esc(p.id)}"><span class="icon-chip c-blue">${productEmoji(p)}</span>
    <div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${esc(t('pr.perUnit', { u: unitLabel(p.unit) }))}${p.trackStock ? ` · ${esc(t('pr.stock'))}: ${fmtQty(p.stock)}` : ''}</div></div>
    <div class="text-end"><div class="money">${esc(cur())} ${fmtMoney(p.salePrice)}</div></div><i class="bi bi-pencil-fill text-body-secondary"></i></button>`).join('') : UI.emptyState(t('pr.empty'), 'box-seam'));
}

export default {
  async render(root) {
    st = { root };
    root.innerHTML = `<div class="page-header"><h1 class="dup">${esc(t('nav.products'))}</h1><button class="btn btn-success" id="pr-add"><i class="bi bi-plus-circle-fill"></i>${esc(t('pr.add'))}</button></div>
      <div class="help-card mb-3"><i class="bi bi-info-circle-fill fs-4"></i><div class="small">${esc(t('pr.help'))}</div></div><div class="list-card" id="pr-list"></div>`;
    draw();
    const $r = $(root);
    $r.on('click', '#pr-add', async () => { if (await form()) draw(); });
    $r.on('click', '#pr-list [data-id]', async function () {
      const p = Catalog.product(this.dataset.id);
      if (await form(p)) draw();
    });
  },
  destroy() { st = null; },
};
