// Urdu / English text. Urdu is the default; every screen uses t('key') so the whole app can switch language.
import { getSettings, saveSettings } from './settings.js';
import ur from '../i18n/ur.js';
import en from '../i18n/en.js';

const DICT = { ur, en };

export const lang = () => (getSettings().lang === 'en' ? 'en' : 'ur');
export const isUrdu = () => lang() === 'ur';
export const locale = () => (isUrdu() ? 'ur-PK-u-nu-latn' : 'en-GB');

// t('key', { n: 5 }) -> text with {n} replaced. Falls back to English, then to the key itself.
export function t(key, vars) {
  let s = DICT[lang()][key] ?? DICT.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

// Translate static HTML: data-i18n (text), data-i18n-ph (placeholder), data-i18n-title (title/aria-label).
export function translateDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
}

// Sets language, direction and the matching Bootstrap build (the RTL build flips margins, paddings, dropdowns...).
export function applyLang() {
  const rtl = isUrdu();
  const h = document.documentElement;
  h.lang = lang(); h.dir = rtl ? 'rtl' : 'ltr'; h.dataset.lang = lang();
  const ltr = document.getElementById('bs-ltr'); const rt = document.getElementById('bs-rtl');
  if (ltr) ltr.disabled = rtl;
  if (rt) rt.disabled = !rtl;
  document.title = t('app.name');
  translateDom();
}

export function setLang(l) {
  saveSettings({ lang: l === 'en' ? 'en' : 'ur' });
  applyLang();
  document.dispatchEvent(new CustomEvent('lang:changed'));
}
export const toggleLang = () => setLang(lang() === 'ur' ? 'en' : 'ur');
