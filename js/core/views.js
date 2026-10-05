// Small shared view fragments: money, balances, month labels, empty/loading helpers used by several screens.
import { esc, fmtMoney, fmtQty } from './utils.js';
import { getSettings } from './settings.js';
import { t, locale } from './i18n.js';

export const cur = () => getSettings().currency;
export const money = (n) => `<span class="money">${esc(cur())} ${fmtMoney(n)}</span>`;
export const moneyText = (n) => `${cur()} ${fmtMoney(n)}`;
export const unitLabel = (u) => t('unit.' + (u || 'pcs'));
export const qtyText = (q, unit = 'L') => `${fmtQty(q)} ${unitLabel(unit)}`;

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
}
export function dayLabel(date, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(date + 'T00:00:00').toLocaleDateString(locale(), opts);
}

// Customer balance chip: they owe us (red), clear (green) or paid in advance.
export function balChip(total) {
  if (Math.abs(total) < 0.5) return `<span class="chip ok"><i class="bi bi-check-circle-fill"></i>${esc(t('bal.clear'))}</span>`;
  return total > 0
    ? `<span class="chip bad">${esc(t('bal.due'))} ${esc(cur())} ${fmtMoney(total)}</span>`
    : `<span class="chip">${esc(t('bal.advance'))} ${esc(cur())} ${fmtMoney(-total)}</span>`;
}

// Wire a "Show more" list so long lists stay light.
export function pager($container, items, rowFn, pageSize = 40, empty = '') {
  let shown = 0;
  const more = () => {
    const chunk = items.slice(shown, shown + pageSize);
    shown += chunk.length;
    $container.find('.pager-more').remove();
    $container.append(chunk.map(rowFn).join(''));
    if (shown < items.length) $container.append(`<button class="list-row pager-more justify-content-center text-primary fw-bold">${esc(t('act.more', { n: items.length - shown }))}</button>`);
  };
  $container.empty();
  if (!items.length) { $container.html(empty); return; }
  $container.off('click.pager').on('click.pager', '.pager-more', more);
  more();
}

// Product → emoji for the shop tiles (name-independent: based on the stored product kind).
const EMOJI = { milk: '🥛', yogurt: '🥣', lassi: '🥤', cream: '🍶', butter: '🧈', ghee: '🫙' };
export function productEmoji(p) {
  if (p.emoji) return p.emoji;
  if (p.milk) return EMOJI.milk;
  const n = (p.name || '').toLowerCase();
  if (/دہی|dahi|yogurt|yoghurt|curd/.test(n)) return EMOJI.yogurt;
  if (/لسی|lassi/.test(n)) return EMOJI.lassi;
  if (/ملائی|کریم|cream/.test(n)) return EMOJI.cream;
  if (/مکھن|butter/.test(n)) return EMOJI.butter;
  if (/گھی|ghee/.test(n)) return EMOJI.ghee;
  return p.unit === 'L' ? EMOJI.milk : '🛒';
}
