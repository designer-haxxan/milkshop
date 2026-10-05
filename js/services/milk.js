// Milk-business logic on top of the posting engine: house-to-house delivery schedule, monthly bills,
// balances (billed + not-yet-billed) and the simple profit summary.
//
// A delivery is one small record per house / day / shift. It carries no accounting by itself; a monthly bill
// turns the unbilled deliveries of a house into ONE credit sale (see Posting.saveSale -> deliveryIds), so stock,
// ledger and balances stay consistent and a delivery can never be billed twice.
import * as idb from '../db/idb.js';
import { round2, round3, num, nowISO, today, uuid, AppError, localDate } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import { t } from '../core/i18n.js';
import * as Catalog from './catalog.js';
import * as Posting from './posting.js';

export const SHIFTS = { m: 'morning', e: 'evening' };
export const shiftOfNow = () => (new Date().getHours() < 14 ? 'm' : 'e');
export const monthOf = (date = today()) => date.slice(0, 7);
export const monthStartOf = (month) => `${month}-01`;
export function monthEndOf(month) {
  const [y, m] = month.split('-').map(Number);
  return localDate(new Date(y, m, 0));
}
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n); return localDate(d);
}

// ---------- customers on the milk round ----------
export const hasRound = (c) => !!c?.milk && c.active !== 0 && (num(c.milk.morning) > 0 || num(c.milk.evening) > 0);
export const milkProductId = () => Catalog.allProducts().find((p) => p.milk)?.id || Catalog.allProducts().find((p) => p.unit === 'L')?.id || null;

export function roundCustomers() {
  return Catalog.allParties('customers').filter(hasRound)
    .sort((a, b) => (a.milk.area || '').localeCompare(b.milk.area || '', 'ur') || num(a.milk.order) - num(b.milk.order) || a.name.localeCompare(b.name, 'ur'));
}
export function areas() {
  return [...new Set(Catalog.allParties('customers').filter((c) => c.active !== 0 && c.milk?.area).map((c) => c.milk.area))].sort((a, b) => a.localeCompare(b, 'ur'));
}

const onHoliday = (c, date) => !!(c.milk.pauseFrom && date >= c.milk.pauseFrom && (!c.milk.pauseTo || date <= c.milk.pauseTo));
export function plannedQty(c, date, shift) {
  if (!c.milk || (c.milk.start && date < c.milk.start) || onHoliday(c, date)) return 0;
  return round3(num(shift === 'm' ? c.milk.morning : c.milk.evening));
}

// ---------- daily delivery sheet ----------
const dId = (customerId, date, shift) => `${customerId}:${date}:${shift}`;

// Rows for one day & shift: houses that are due, plus houses that got an extra/changed delivery.
export async function daySheet(date, shift) {
  const recs = await idb.getAllByIndex('deliveries', 'date', IDBKeyRange.only(date));
  const byId = new Map(recs.filter((r) => r.shift === shift).map((r) => [r.customerId, r]));
  const rows = [];
  for (const c of Catalog.allParties('customers')) {
    if (c.active === 0 || !c.milk) continue;
    const planned = plannedQty(c, date, shift);
    const rec = byId.get(c.id) || null;
    if (planned > 0 || rec) rows.push({ customer: c, planned, rec });
  }
  rows.sort((a, b) => (a.customer.milk.area || '').localeCompare(b.customer.milk.area || '', 'ur') || num(a.customer.milk.order) - num(b.customer.milk.order) || a.customer.name.localeCompare(b.customer.name, 'ur'));
  return rows;
}

function makeRecord(c, date, shift, qty, status) {
  const p = Catalog.product(c.milk.productId) || Catalog.product(milkProductId());
  const rate = round2(num(c.milk.rate) || num(p?.salePrice));
  return { id: dId(c.id, date, shift), customerId: c.id, date, shift, productId: p?.id || c.milk.productId, qty: status === 'done' ? round3(qty) : 0, planned: plannedQty(c, date, shift), rate,
    amount: status === 'done' ? round2(qty * rate) : 0, status, ...(status === 'done' ? { open: 1 } : {}), at: nowISO() };
}

// status: 'done' | 'skip' | null (null = undo, back to "not yet")
export async function setDelivery(customerId, date, shift, status, qty) {
  const c = Catalog.party('customers', customerId);
  if (!c?.milk) throw new AppError(t('err.notfound'));
  await idb.write(['deliveries'], async (tx) => {
    const old = await tx.get('deliveries', dId(customerId, date, shift));
    if (old?.billId) throw new AppError(t('err.billed'));
    if (status === null) { if (old) await tx.delete('deliveries', old.id); return; }
    const q = round3(num(qty, plannedQty(c, date, shift)));
    if (status === 'done' && !(q > 0)) throw new AppError(t('err.qty'));
    await tx.put('deliveries', makeRecord(c, date, shift, q, status));
  });
  document.dispatchEvent(new CustomEvent('data:changed'));
}

// Mark every house in the list that is still "not yet" as delivered with its planned quantity.
export async function markAll(date, shift, rows) {
  let n = 0;
  await idb.write(['deliveries'], async (tx) => {
    for (const r of rows) {
      if (r.rec || !(r.planned > 0)) continue;
      await tx.put('deliveries', makeRecord(r.customer, date, shift, r.planned, 'done')); n++;
    }
  });
  document.dispatchEvent(new CustomEvent('data:changed'));
  return n;
}

export async function monthRecords(customerId, month) {
  return idb.getAllByIndex('deliveries', 'custDate', IDBKeyRange.bound([customerId, monthStartOf(month)], [customerId, monthEndOf(month)]));
}

// ---------- balances ----------
// unbilled value per customer (delivered, not yet on a bill)
export async function unbilledMap(upTo = '9999-12-31') {
  const map = new Map();
  for (const r of await idb.getAllByIndex('deliveries', 'open', IDBKeyRange.only(1))) {
    if (r.billId || r.status !== 'done' || r.date > upTo) continue;
    const x = map.get(r.customerId) || { qty: 0, amount: 0, days: new Set() };
    x.qty += r.qty; x.amount += r.amount; x.days.add(r.date); map.set(r.customerId, x);
  }
  for (const x of map.values()) { x.qty = round3(x.qty); x.amount = round2(x.amount); x.days = x.days.size; }
  return map;
}

// { billed (ledger balance), unbilled, total } for every customer id
export async function customerBalances() {
  const [bal, unb] = await Promise.all([Posting.allBalances(), unbilledMap()]);
  const out = new Map();
  for (const c of Catalog.allParties('customers')) {
    const billed = bal.get(Posting.partyAccount('customers', c.id))?.balance || 0;
    const u = unb.get(c.id) || { amount: 0, qty: 0, days: 0 };
    out.set(c.id, { billed: round2(billed), unbilled: u.amount, qty: u.qty, days: u.days, total: round2(billed + u.amount) });
  }
  return out;
}

export async function supplierBalances() {
  const bal = await Posting.allBalances();
  return new Map(Catalog.allParties('suppliers').map((s) => [s.id, round2(-(bal.get(Posting.partyAccount('suppliers', s.id))?.balance || 0))]));
}

// ---------- monthly bills ----------
// Collects the unbilled, delivered records of a house up to the end of `month`.
export async function previewBill(customerId, month) {
  const upTo = monthEndOf(month);
  const recs = (await idb.getAllByIndex('deliveries', 'customerId', customerId)).filter((r) => !r.billId && r.status === 'done' && r.date <= upTo).sort((a, b) => a.date.localeCompare(b.date));
  const groups = new Map();
  for (const r of recs) {
    const k = `${r.productId}|${r.rate}`;
    const g = groups.get(k) || { productId: r.productId, rate: r.rate, qty: 0 };
    g.qty = round3(g.qty + r.qty); groups.set(k, g);
  }
  const lines = [...groups.values()].map((g) => ({ ...g, name: Catalog.product(g.productId)?.name || '?', unit: Catalog.product(g.productId)?.unit || 'L', amount: round2(g.qty * g.rate) }));
  return {
    customerId, month, lines, ids: recs.map((r) => r.id), days: new Set(recs.map((r) => r.date)).size,
    from: recs[0]?.date || null, to: recs[recs.length - 1]?.date || null,
    qty: round3(recs.reduce((s, r) => s + r.qty, 0)), total: round2(lines.reduce((s, l) => s + l.amount, 0)),
  };
}

export async function makeBill(customerId, month) {
  const b = await previewBill(customerId, month);
  if (!b.ids.length) throw new AppError(t('err.nothingToBill'));
  const date = monthEndOf(month) < today() ? monthEndOf(month) : today();
  const { doc } = await Posting.saveSale({
    id: uuid(), customerId, date, tendered: 0, items: b.lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty, rate: l.rate })),
    deliveryIds: b.ids, bill: { month, from: b.from, to: b.to, days: b.days }, note: t('bill.noteFor', { m: month }),
  });
  return doc;
}

// Bills made so far for a month (not voided)
export async function billsOfMonth(month) {
  const all = await idb.getAllByIndex('sales', 'date', IDBKeyRange.bound(monthStartOf(addMonths(month, 0)), '9999-12-31'));
  return all.filter((s) => s.bill && s.bill.month === month && s.status !== 'void');
}
export async function billsOfCustomer(customerId) {
  return (await idb.getAllByIndex('sales', 'customerId', customerId)).filter((s) => s.bill && s.status !== 'void').sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- payments ----------
const uid = () => uuid();
export function receiveFromCustomer(customerId, amount, note = '', date = today()) {
  return Posting.saveVoucher({ id: uid(), type: 'receipt', accountId: 'cash', counterAccountId: Posting.partyAccount('customers', customerId), amount, date, note });
}
export function payToSupplier(supplierId, amount, note = '', date = today()) {
  return Posting.saveVoucher({ id: uid(), type: 'payment', accountId: 'cash', counterAccountId: Posting.partyAccount('suppliers', supplierId), amount, date, note });
}
export function addExpense(amount, note, date = today()) {
  return Posting.saveVoucher({ id: uid(), type: 'payment', accountId: 'cash', counterAccountId: 'expense', amount, date, note });
}

// ---------- summaries ----------
const live = (x) => x.filter((d) => d.status !== 'void');
export async function summary(from, to) {
  const range = IDBKeyRange.bound(from, to);
  const [deliveries, sales, saleItems, purchases, purchaseItems, vouchers, entries] = await idb.read(
    ['deliveries', 'sales', 'saleItems', 'purchases', 'purchaseItems', 'vouchers', 'entries'], (tx) => Promise.all([
      tx.getAllByIndex('deliveries', 'date', range), tx.getAllByIndex('sales', 'date', range), tx.getAllByIndex('saleItems', 'date', range),
      tx.getAllByIndex('purchases', 'date', range), tx.getAllByIndex('purchaseItems', 'date', range), tx.getAllByIndex('vouchers', 'date', range),
      tx.getAllByIndex('entries', 'acctDate', IDBKeyRange.bound(['expense', from], ['expense', to])),
    ]));
  const done = deliveries.filter((d) => d.status === 'done');
  const shopSales = live(sales).filter((s) => !s.bill);
  const shopIds = new Set(shopSales.map((s) => s.id));
  const sum = (arr, f) => round2(arr.reduce((a, x) => a + f(x), 0));
  const litre = (it) => (Catalog.product(it.productId)?.unit === 'L' || it.unit === 'L' ? it.qty : 0);
  const r = {
    deliveryValue: sum(done, (d) => d.amount), deliveryQty: round3(done.reduce((a, d) => a + d.qty, 0)),
    deliveryHouses: new Set(done.map((d) => d.customerId)).size,
    shopSales: sum(shopSales, (s) => s.total), shopCount: shopSales.length,
    shopQty: round3(saleItems.filter((i) => shopIds.has(i.saleId)).reduce((a, i) => a + litre(i), 0)),
    purchases: sum(live(purchases), (p) => p.total), purchaseQty: round3(purchaseItems.reduce((a, i) => a + litre(i), 0)),
    expenses: sum(entries.filter((e) => e.refType === 'payment'), (e) => e.debit - e.credit),
    received: sum(live(vouchers).filter((v) => v.type === 'receipt' && v.counterType === 'customer'), (v) => v.amount),
    cashSales: sum(shopSales, (s) => s.paid),
  };
  r.income = round2(r.deliveryValue + r.shopSales);
  r.profit = round2(r.income - r.purchases - r.expenses);
  r.soldQty = round3(r.deliveryQty + r.shopQty);
  return r;
}

export async function cashInHand() { return Posting.accountBalance('cash'); }

// ---------- WhatsApp ----------
export function waPhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  else if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d;
}
export const waLink = (phone, text) => `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;

// ---------- first-run seed ----------
export async function setupShop({ name, phone, milkRate, yogurtRate }) {
  const { saveSettings } = await import('../core/settings.js');
  saveSettings({ business: { ...getSettings().business, name: name || getSettings().business.name, phone: phone || '' } });
  const items = [
    { key: 'milk', unit: 'L', price: milkRate, milk: true }, { key: 'yogurt', unit: 'kg', price: yogurtRate },
    { key: 'lassi', unit: 'L', price: Math.round((milkRate || 200) * 0.45 / 5) * 5 }, { key: 'cream', unit: 'kg', price: Math.round((milkRate || 200) * 3.6 / 10) * 10 },
    { key: 'butter', unit: 'kg', price: Math.round((milkRate || 200) * 12 / 50) * 50 }, { key: 'ghee', unit: 'kg', price: Math.round((milkRate || 200) * 13 / 50) * 50 },
  ];
  for (const it of items) {
    const p = await Posting.saveProduct({ name: t('prod.' + it.key), unit: it.unit, salePrice: it.price, purchasePrice: 0, trackStock: false });
    if (it.milk) await idb.write(['products'], async (tx) => { const x = await tx.get('products', p.id); x.milk = true; await tx.put('products', x); });
  }
  await Catalog.load();
}
