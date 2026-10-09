// Application bootstrap: service worker, database, authentication gate, navigation and routing.
import { applyTheme, getSettings } from './core/settings.js';
import { applyLang, t, toggleLang } from './core/i18n.js';
import * as UI from './core/ui.js';
import { esc } from './core/utils.js';
import { openDB } from './db/idb.js';
import * as Auth from './services/auth.js';
import * as Catalog from './services/catalog.js';

const $ = window.jQuery;

// Route table: name → [loader, title key, permission|null, icon, menu section key]
const ROUTES = {
  home: [() => import('./modules/home.js'), 'nav.home', null, 'house-door-fill', 'sec.main'],
  delivery: [() => import('./modules/delivery.js'), 'nav.delivery', null, 'bicycle', 'sec.main'],
  shop: [() => import('./modules/shop.js'), 'nav.shop', 'sale.create', 'shop', 'sec.main'],
  bills: [() => import('./modules/bills.js'), 'nav.bills', null, 'receipt-cutoff', 'sec.main'],
  quickprint: [() => import('./modules/quickprint.js'), 'nav.quickprint', null, 'tags-fill', 'sec.main'],
  customers: [() => import('./modules/customers.js'), 'nav.customers', null, 'people-fill', 'sec.people'],
  buy: [() => import('./modules/buy.js'), 'nav.buy', 'purchase.manage', 'truck', 'sec.people'],
  money: [() => import('./modules/money.js'), 'nav.money', 'voucher.create', 'cash-coin', 'sec.accounts'],
  profit: [() => import('./modules/profit.js'), 'nav.profit', 'reports.view', 'graph-up-arrow', 'sec.accounts'],
  products: [() => import('./modules/products.js'), 'nav.products', null, 'box-seam-fill', 'sec.admin'],
  settings: [() => import('./modules/settings.js'), 'nav.settings', null, 'gear-fill', 'sec.admin'],
  backup: [() => import('./modules/backup.js'), 'nav.backup', 'backup.export', 'cloud-arrow-down-fill', 'sec.admin'],
};
const FOCUS_ROUTES = new Set();

let currentModule = null;
let routeToken = 0;
let deferredInstall = null;

function showView(name) {
  $('#splash').addClass('d-none');
  $('#view-login').toggleClass('d-none', name !== 'login');
  $('#view-app').toggleClass('d-none', name !== 'app');
}

function fatal(msg) {
  $('#splash-error').text(msg);
}

// ---------- Service worker & install ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    const check = () => {
      if (!navigator.onLine) return;
      reg.update().catch(() => {});
      (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: 'ENSURE_CACHE' });
    };
    check();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch((e) => console.warn('Service worker registration failed:', e));
  let controlled = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled && !reloading) { reloading = true; location.reload(); }
    controlled = true;
  });
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('#install-btn').removeClass('d-none'); });
window.addEventListener('appinstalled', () => { deferredInstall = null; $('#install-btn').addClass('d-none'); UI.toast(t('app.installed')); });
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null; $('#install-btn').addClass('d-none');
  return true;
}
export const canInstall = () => !!deferredInstall;

// ---------- Connection badge ----------
function renderConn() {
  const online = navigator.onLine;
  $('#conn-badge').attr('class', `badge rounded-pill ${online ? 'conn-online' : 'conn-offline'}`).html(`<i class="bi bi-${online ? 'wifi' : 'wifi-off'}"></i> <span>${esc(t(online ? 'conn.online' : 'conn.offline'))}</span>`);
  $('#login-conn').html(online ? `<i class="bi bi-wifi text-success"></i> ${esc(t('conn.online'))}` : `<i class="bi bi-wifi-off text-danger"></i> ${esc(t('login.offline'))}`);
}
window.addEventListener('online', renderConn);
window.addEventListener('offline', renderConn);

// ---------- Navigation ----------
function buildMenu() {
  let html = ''; let section = '';
  for (const [name, [, title, perm, icon, sec]] of Object.entries(ROUTES)) {
    if (perm && !Auth.can(perm)) continue;
    if (sec !== section) { section = sec; html += `<div class="nav-section">${esc(t(sec))}</div>`; }
    html += `<a class="nav-link" href="#/${name}" data-route="${name}"><i class="bi bi-${icon}"></i>${esc(t(title))}</a>`;
  }
  $('.nav-menu').html(html);
  const u = Auth.user();
  if (u) { $('#user-name').text(u.name); $('#user-avatar').text(UI.initials(u.name)); }
  $('#brand-name').text(getSettings().business.name || t('app.name'));
  $('#bottom-nav [data-route="shop"]').toggleClass('d-none', !Auth.can('sale.create'));
}

function markActive(name) {
  $('.nav-menu .nav-link, #bottom-nav a').removeClass('active');
  $(`.nav-menu [data-route="${name}"], #bottom-nav [data-route="${name}"]`).addClass('active');
}

async function route() {
  if (!Auth.user()) return;
  if (checkExpiry()) return;
  const token = ++routeToken;
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/').map(decodeURIComponent);
  const name = ROUTES[parts[0]] ? parts[0] : 'home';
  const [loader, title, perm] = ROUTES[name];
  try { currentModule?.destroy?.(); } catch (e) { console.warn(e); }
  currentModule = null;
  bootstrap.Offcanvas.getInstance('#menu-offcanvas')?.hide();
  markActive(name);
  $('body').toggleClass('focus-mode', FOCUS_ROUTES.has(name));
  $('#topbar-title').text(t(title));
  const $c = $('#content').off();
  if (perm && !Auth.can(perm)) { $c.html(UI.emptyState(t('err.noperm'), 'shield-lock')); return; }
  $c.html(UI.spinner());
  try {
    const mod = (await loader()).default;
    if (token !== routeToken) return;
    currentModule = mod;
    window.scrollTo(0, 0);
    $c.removeClass('page-enter');
    await mod.render($c[0], { route: name, params: parts.slice(1), setTitle: (x) => $('#topbar-title').text(x) });
    if (token === routeToken) { void $c[0].offsetWidth; $c.addClass('page-enter'); }
  } catch (e) {
    console.error(e);
    if (token === routeToken) $c.html(UI.errorState(e));
  }
}

// ---------- Auth gate ----------
async function startApp() {
  await Catalog.load();
  buildMenu();
  showView('app');
  renderConn();
  clearInterval(expiryTimer);
  expiryTimer = setInterval(checkExpiry, 60000);
  if (navigator.storage?.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });
  route();
}

async function doLogout(forced = false, reason = '') {
  if (!forced && !await UI.confirmDialog(t('logout.msg'), { title: t('app.logout'), okLabel: t('app.logout'), okClass: 'btn-danger' })) return;
  clearInterval(expiryTimer);
  try { currentModule?.destroy?.(); } catch { /* ignore */ }
  currentModule = null;
  Auth.logout();
  $('#content').empty();
  showLogin(reason);
}

let expiryTimer = null;
function checkExpiry() {
  if (!Auth.sessionExpired()) return false;
  UI.toast(t('login.expired'), 'warning', 6000);
  doLogout(true, t('login.expired'));
  return true;
}

function showLogin(reason = '') {
  showView('login');
  renderConn();
  $('#login-notice').toggleClass('d-none', !reason).html(esc(reason));
  setTimeout(() => $('#login-username').trigger('focus'), 50);
}

$('#login-form').on('submit', async (e) => {
  e.preventDefault();
  const $btn = $('#login-btn').prop('disabled', true).html(`<span class="spinner-border spinner-border-sm"></span><span>${esc(t('login.wait'))}</span>`);
  $('#login-error').addClass('d-none');
  try {
    await Auth.login($('#login-username').val(), $('#login-password').val());
    $('#login-password').val('');
    await startApp();
  } catch (err) {
    $('#login-error').text(err.message || String(err)).removeClass('d-none');
    $('.auth-card').removeClass('shake'); void $('.auth-card')[0].offsetWidth; $('.auth-card').addClass('shake');
  } finally { $btn.prop('disabled', false).html(`<span>${esc(t('login.btn'))}</span><i class="bi bi-box-arrow-in-right"></i>`); }
});
$('#toggle-pw').on('click', () => {
  const $i = $('#login-password'); const show = $i.attr('type') === 'password';
  $i.attr('type', show ? 'text' : 'password');
  $('#toggle-pw i').attr('class', show ? 'bi bi-eye-slash' : 'bi bi-eye');
});
$('#logout-btn').on('click', () => doLogout(false));
$('#install-btn').on('click', promptInstall);
$(document).on('click', '[data-act="lang"]', () => toggleLang());
window.addEventListener('hashchange', route);
document.addEventListener('settings:changed', () => { applyTheme(); if (Auth.user()) $('#brand-name').text(getSettings().business.name || t('app.name')); });
// Language switch: translate the shell and redraw the current screen.
document.addEventListener('lang:changed', () => {
  renderConn();
  if (Auth.user()) { buildMenu(); route(); } else $('#login-notice').addClass('d-none');
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- Boot ----------
(async function boot() {
  applyTheme();
  applyLang();
  registerSW();
  if (!window.jQuery || !window.bootstrap) return fatal(t('err.libs'));
  try { await openDB(); } catch (e) { return fatal(t('err.db') + ' ' + (e.message || e)); }
  const { user, reason } = Auth.restoreSession();
  if (user) {
    try { await startApp(); } catch (e) { console.error(e); fatal(e.message || String(e)); }
  } else showLogin(reason ? t('login.expired') : '');
})();
