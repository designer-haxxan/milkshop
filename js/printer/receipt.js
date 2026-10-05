// Builds a printer-independent receipt model and renders it to ESC/POS bytes or HTML.
import * as idb from '../db/idb.js';
import { getSettings } from '../core/settings.js';
import { fmtMoney, fmtQty, esc, localDate } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { monthLabel } from '../core/views.js';
import * as Posting from '../services/posting.js';
import { EscPos, isPlain } from './escpos.js';
import * as Raster from './raster.js';

const TITLE_KEY = { sale: 'rc.sale', purchase: 'rc.purchase', saleReturn: 'rc.saleReturn', purchaseReturn: 'rc.purchaseReturn', receipt: 'rc.receipt', payment: 'rc.payment', transfer: 'rc.transfer' };
const p2 = (n) => String(n).padStart(2, '0');
const rcDate = (d) => (d ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}` : '');
const rcDateTime = (iso) => { const d = new Date(iso); return `${rcDate(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const unitText = (u) => t('unit.' + (u || 'pcs'));

export async function buildReceipt(kind, doc) {
  const s = getSettings();
  const b = s.business;
  const m = { header: [b.name, b.address, b.phone ? t('rc.tel') + ': ' + b.phone : ''].filter(Boolean), title: t(TITLE_KEY[kind] || 'rc.sale'),
    info: [], items: [], totals: [], footer: b.footer || '', void: doc.status === 'void' };
  const sameDay = doc.createdAt && localDate(new Date(doc.createdAt)) === doc.date;
  m.info.push([t('rc.no'), doc.number], [t('rc.date'), sameDay ? rcDateTime(doc.createdAt) : rcDate(new Date(doc.date + 'T00:00:00'))]);

  if (kind === 'sale' || kind === 'purchase') {
    const items = await idb.getAllByIndex(kind === 'sale' ? 'saleItems' : 'purchaseItems', kind === 'sale' ? 'saleId' : 'purchaseId', doc.id);
    const list = items.length ? items : (doc.voidedItems || []);
    list.sort((a, b) => a.line - b.line);
    m.info.push([kind === 'sale' ? t('rc.customer') : t('rc.supplier'), kind === 'sale' ? doc.customerName : doc.supplierName]);
    m.items = list.map((i) => ({ name: i.name, qty: i.qty, unit: unitText(i.unit), rate: i.rate, discount: i.discount, amount: i.amount }));
    if (kind === 'sale' && doc.bill) {
      m.title = t('rc.bill');
      m.info.push([t('rc.month'), monthLabel(doc.bill.month)], [t('rc.days'), String(doc.bill.days || '')]);
      const bal = doc.customerId ? await Posting.accountBalance(Posting.partyAccount('customers', doc.customerId)) : doc.total;
      const prev = Math.round((bal - doc.total) * 100) / 100;
      m.totals.push([t('rc.thisBill'), doc.total]);
      if (Math.abs(prev) >= 0.5) m.totals.push([prev > 0 ? t('rc.prev') : t('rc.advance'), Math.abs(prev)]);
      m.totals.push([t('rc.totalDue'), bal, true]);
      return m;
    }
    m.totals.push([t('rc.subtotal'), doc.subtotal]);
    if (doc.discount) m.totals.push([t('rc.discount'), -doc.discount]);
    m.totals.push([t('rc.total'), doc.total, true]);
    if (kind === 'sale' && doc.tendered > doc.paid) m.totals.push([t('rc.tendered'), doc.tendered]);
    m.totals.push([t('rc.paid'), doc.paid]);
    if (doc.change) m.totals.push([t('rc.change'), doc.change]);
    if (doc.balance) m.totals.push([t('rc.balance'), doc.balance, true]);
  } else if (kind === 'saleReturn' || kind === 'purchaseReturn') {
    m.info.push([t('rc.against'), doc.docNo], [kind === 'saleReturn' ? t('rc.customer') : t('rc.supplier'), doc.partyName || '']);
    m.items = doc.items.map((i) => ({ name: i.name, qty: i.qty, unit: unitText(i.unit), rate: i.rate, amount: i.amount }));
    m.totals.push([t('rc.total'), doc.total, true]);
  } else {
    m.title = t(TITLE_KEY[doc.type]);
    m.info.push([doc.type === 'receipt' ? t('rc.from') : t('rc.to'), doc.counterName]);
    if (doc.note) m.info.push([t('rc.note'), doc.note]);
    m.totals.push([t('rc.amount'), doc.amount, true]);
  }
  if (doc.note && kind !== 'voucher' && kind !== 'receipt' && kind !== 'payment') m.note = doc.note;
  return m;
}

// Async because Urdu/non-Latin lines are rendered with the Jameel Noori Nastaleeq web font.
export async function toEscPos(m, width = 58) {
  await Raster.ensureFont();
  const p = new EscPos(width, Raster, { imageMode: getSettings().printer.imageMode });
  const cur = getSettings().currency;
  p.align('center');
  m.header.forEach((h, i) => { if (i === 0) p.bold(true).size(true).wrap(h, Math.floor(p.cols / 2)).size(false).bold(false); else p.wrap(h); });
  p.hr().bold(true).line(m.title).bold(false);
  if (m.void) p.bold(true).line('*** VOID ***').bold(false);
  p.align('left');
  m.info.forEach(([k, v]) => p.lr(k + ':', String(v ?? '')));
  if (m.items.length) {
    p.hr();
    m.items.forEach((i) => {
      p.wrap(i.name);
      p.lr(`  ${fmtQty(i.qty)} ${i.unit || ''} x ${fmtMoney(i.rate)}`, fmtMoney(i.amount));
      if (i.discount) p.lr('  ' + t('rc.discount'), '-' + fmtMoney(i.discount));
    });
  }
  p.hr();
  m.totals.forEach(([k, v, strong]) => { if (strong) p.bold(true); p.lr(k, `${v < 0 ? '-' : ''}${cur} ${fmtMoney(Math.abs(v))}`); if (strong) p.bold(false); });
  if (m.note) { p.hr(); p.wrap(t('rc.note') + ': ' + m.note); }
  p.hr().align('center');
  if (m.footer) p.wrap(m.footer);
  p.feed(3).cut();
  return p.bytes();
}

// Urdu/RTL text is wrapped so it uses Jameel Noori Nastaleeq and right-to-left layout.
const tx = (s) => (isPlain(s) ? esc(s) : `<span class="ur" dir="auto">${esc(s)}</span>`);

export function toHTML(m, width = 58) {
  const cur = esc(getSettings().currency);
  const row = (l, r, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="r">${r}</td></tr>`;
  return `<div class="receipt w${Number(width) === 80 ? 80 : 58}">
    ${m.header.map((h, i) => `<div class="c ${i === 0 ? 'b big' : ''}">${tx(h)}</div>`).join('')}
    <hr><div class="c b">${tx(m.title)}</div>${m.void ? '<div class="c b">*** VOID ***</div>' : ''}
    <table>${m.info.map(([k, v]) => row(tx(k) + ':', tx(v))).join('')}</table>
    ${m.items.length ? '<hr><table>' + m.items.map((i) => `<tr><td colspan="2">${tx(i.name)}</td></tr>${row('&nbsp;&nbsp;' + tx(`${fmtQty(i.qty)} ${i.unit || ''} x ${fmtMoney(i.rate)}`), fmtMoney(i.amount))}${i.discount ? row('&nbsp;&nbsp;' + tx(t('rc.discount')), '-' + fmtMoney(i.discount)) : ''}`).join('') + '</table>' : ''}
    <hr><table>${m.totals.map(([k, v, strong]) => row(tx(k), `${v < 0 ? '-' : ''}${cur} ${fmtMoney(Math.abs(v))}`, strong ? 'b' : '')).join('')}
    </table>
    ${m.note ? `<hr><div>${esc(t('rc.note'))}: ${tx(m.note)}</div>` : ''}
    <hr>${m.footer ? `<div class="c">${tx(m.footer)}</div>` : ''}</div>`;
}
