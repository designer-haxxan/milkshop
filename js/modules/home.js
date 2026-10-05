// Home: today at a glance, big shortcut tiles, and first-run shop setup.
import * as UI from '../core/ui.js';
import { esc, fmtMoney, fmtQty, today, num } from '../core/utils.js';
import { getSettings, pref } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { dayLabel, cur } from '../core/views.js';
import * as Catalog from '../services/catalog.js';
import * as Milk from '../services/milk.js';
import * as Auth from '../services/auth.js';

const $ = window.jQuery;

const greet = () => { const h = new Date().getHours(); return t(h < 12 ? 'greet.m' : h < 17 ? 'greet.a' : 'greet.e'); };

async function shiftProgress(shift) {
  const rows = await Milk.daySheet(today(), shift);
  const done = rows.filter((r) => r.rec).length;
  return { total: rows.length, done, pct: rows.length ? Math.round((done / rows.length) * 100) : 0 };
}

export function setupWizard() {
  return UI.formModal({
    title: t('setup.title'), submitLabel: t('setup.go'), submitClass: 'btn-success btn-lg',
    body: `<div class="help-card mb-3"><i class="bi bi-stars fs-3"></i><div>${esc(t('setup.help'))}</div></div>
      <div class="mb-3"><label class="form-label">${esc(t('setup.shopname'))}</label><input name="name" class="form-control" required value="${esc(getSettings().business.name)}"></div>
      <div class="mb-3"><label class="form-label">${esc(t('set.phone'))}</label><input name="phone" class="form-control" inputmode="tel" dir="ltr" placeholder="03xx-xxxxxxx"></div>
      <div class="row g-3"><div class="col-6"><label class="form-label">🥛 ${esc(t('setup.milkrate'))}</label><input name="milkRate" class="form-control" inputmode="decimal" dir="ltr" value="220" required></div>
      <div class="col-6"><label class="form-label">🥣 ${esc(t('setup.yogurtrate'))}</label><input name="yogurtRate" class="form-control" inputmode="decimal" dir="ltr" value="260" required></div></div>
      <div class="small text-body-secondary mt-3">${esc(t('setup.later'))}</div>`,
    onSubmit: async (v) => {
      await Milk.setupShop({ name: v.name.trim(), phone: v.phone.trim(), milkRate: num(v.milkRate), yogurtRate: num(v.yogurtRate) });
      UI.toast(t('setup.done'));
      return true;
    },
  });
}

const tile = (href, icon, color, label, sub = '', badge = '') =>
  `<a href="${href}" class="hub-tile"><span class="icon-chip ${color}"><i class="bi bi-${icon}"></i></span><span>${esc(label)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}${badge}</a>`;

async function draw(root) {
  const s = getSettings();
  const needSetup = Catalog.allProducts().length === 0;
  const [sum, bals, m, e] = await Promise.all([Milk.summary(today(), today()), Milk.customerBalances(), shiftProgress('m'), shiftProgress('e')]);
  let due = 0; let dueCount = 0;
  for (const b of bals.values()) if (b.total > 0.5) { due += b.total; dueCount++; }
  const unbilledHouses = [...bals.values()].filter((b) => b.unbilled > 0).length;
  const days = Math.floor((Date.now() - (pref.get('lastBackup') || 0)) / 86400000);
  const backupOld = !pref.get('lastBackup') ? Catalog.allParties('customers').length > 0 : days >= 7;

  const ring = (label, icon, p) => `<a href="#/delivery/${p === m ? 'm' : 'e'}" class="d-flex align-items-center gap-3 text-decoration-none text-body list-row" style="border-radius:20px">
      <div class="ring" style="--p:${p.pct}"><span>${p.pct}%</span></div>
      <div class="grow"><div class="t"><i class="bi bi-${icon} me-1"></i>${esc(label)}</div>
        <div class="s">${p.total ? esc(t('home.houses', { a: p.done, b: p.total })) : esc(t('home.nohouses'))}</div></div>
      <i class="bi bi-chevron-right text-body-secondary"></i></a>`;

  root.innerHTML = `
    <div class="hero-card mb-3">
      <div class="hi">${esc(greet())} 👋</div>
      <div class="shop">${esc(s.business.name)}</div>
      <div class="hi">${esc(dayLabel(today()))}</div>
      <div class="hero-stats">
        <div><div class="v"><span data-count="${sum.soldQty}">0</span></div><div class="l">${esc(t('home.litresSold'))}</div></div>
        <div><div class="v"><span data-count="${sum.income}" data-money="1">0</span></div><div class="l">${esc(t('home.todaySale'))}</div></div>
        <div><div class="v"><span data-count="${due}" data-money="1">0</span></div><div class="l">${esc(t('home.pending'))}</div></div>
      </div>
    </div>
    ${needSetup ? `<button class="btn btn-success btn-lg w-100 mb-3" id="start-setup"><i class="bi bi-magic"></i>${esc(t('setup.title'))}</button>` : ''}
    ${backupOld ? `<a href="#/backup" class="help-card text-decoration-none mb-3"><i class="bi bi-cloud-arrow-down-fill fs-3 text-warn"></i><div><div class="fw-bold">${esc(t('home.backupTitle'))}</div><div class="small">${esc(t('home.backupMsg'))}</div></div></a>` : ''}
    <div class="section-title"><i class="bi bi-bicycle"></i>${esc(t('home.todayDelivery'))}</div>
    <div class="list-card stagger mb-3">${ring(t('shift.m'), 'sunrise-fill', m)}${ring(t('shift.e'), 'moon-stars-fill', e)}</div>
    <div class="hub stagger">
      ${tile('#/delivery', 'bicycle', 'c-blue', t('nav.delivery'), t('home.sub.delivery'))}
      ${Auth.can('sale.create') ? tile('#/shop', 'shop', 'c-green', t('nav.shop'), t('home.sub.shop')) : ''}
      ${tile('#/bills', 'receipt-cutoff', 'c-amber', t('nav.bills'), t('home.sub.bills'), unbilledHouses ? `<span class="badge-dot">${unbilledHouses}</span>` : '')}
      ${tile('#/customers', 'people-fill', 'c-violet', t('nav.customers'), t('home.sub.customers', { n: Catalog.allParties('customers').filter((c) => c.active !== 0).length }), dueCount ? `<span class="badge-dot">${dueCount}</span>` : '')}
      ${Auth.can('purchase.manage') ? tile('#/buy', 'truck', 'c-teal', t('nav.buy'), t('home.sub.buy')) : ''}
      ${Auth.can('voucher.create') ? tile('#/money', 'cash-coin', 'c-pink', t('nav.money'), t('home.sub.money')) : ''}
      ${Auth.can('reports.view') ? tile('#/profit', 'graph-up-arrow', 'c-green', t('nav.profit'), t('home.sub.profit')) : ''}
      ${tile('#/products', 'box-seam-fill', 'c-blue', t('nav.products'), t('home.sub.products'))}
    </div>`;
  UI.countUp(root, (v, el) => (el.dataset.money ? `${cur()} ${fmtMoney(v)}` : fmtQty(v)));
  $(root).find('#start-setup').on('click', async () => { if (await setupWizard()) draw(root); });
  if (needSetup && !pref.get('setupShown')) { pref.set('setupShown', 1); if (await setupWizard()) draw(root); }
}

let onData = null;
export default {
  async render(root) {
    await draw(root);
    onData = () => { if (root.isConnected) draw(root); };
    document.addEventListener('data:changed', onData);
  },
  destroy() { if (onData) document.removeEventListener('data:changed', onData); onData = null; },
};
