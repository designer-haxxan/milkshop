# Doodh Wala / دودھ والا

Milk shop manager for Pakistan: house-to-house daily delivery, monthly bills (with WhatsApp), shop counter sales,
milk purchase from farmers, and a simple profit view. **Urdu by default, English with one tap.** Offline-first static
PWA (no build step): HTML5 · ES modules · jQuery · Bootstrap 5 (RTL build for Urdu) · IndexedDB · Service Worker ·
eposwala login API.

Built for shop owners who are not used to software: big buttons, big numbers, icons next to every word, one tap to do the
daily job, and no accounting words.

## What it does

| Screen | What the owner does |
|---|---|
| **Home (ہوم)** | Today's litres, income and total pending money; progress of the morning / evening round; big shortcut tiles. First run asks for the shop name and milk / yogurt rates, then creates the item list. |
| **Delivery (ڈیلیوری)** | Pick **صبح / شام** (morning / evening) and the day. Every house is one card: tap ✔ if the milk was delivered, ✖ for a skipped day (ناغہ), tap the quantity to change it. "Mark all delivered" for the usual day. Filter by area, search, add an extra delivery for another customer. |
| **Customers (گاہک)** | Name, phone, address, area, morning / evening litres, rate per litre, start date, old balance. Customer page: balance (billed + not yet billed), month calendar (tap a day to fix it), **holiday** (چھٹی) for travelling customers, receive money, make bill, call, WhatsApp. |
| **Bills (بل)** | Month view: "Make all bills" in one tap, then WhatsApp (Urdu text with items, previous balance, total due) or print each bill. Deleting a bill makes its delivery days billable again. |
| **Shop (دکان)** | Product tiles (milk, yogurt, lassi, cream, butter, ghee…), quantity steppers, discount, cash (shows change) or **ادھار** on a customer's account, today's sales with delete / reprint. The cart survives a refresh. |
| **Buy Milk (دودھ خرید)** | Litres × rate from a supplier (گوالا), paid now or left unpaid, supplier balances and payments. |
| **Money (رقم)** | Cash in shop, who still owes you, receive from a customer, pay a supplier, record an expense (rent, fuel, salary, feed…). |
| **Profit (منافع)** | Today / 7 days / this month / last month: income − milk purchase − expenses, litres bought vs sold, money received. |
| **Items & Rates, Settings, Backup** | Rates per litre / kg / piece, shop details, language, printer, JSON backup & restore. |

## How the accounting works (so the numbers can be trusted)

- A delivery is a small record per **house / day / shift** (`deliveries`, id `customerId:date:shift`). It has no
  accounting by itself, so marking 100 houses is instant and can be undone.
- A **monthly bill** turns all not-yet-billed deliveries of one customer into **one credit sale** through the existing
  posting engine. In the same IndexedDB transaction it writes the sale lines, the balanced double-entry ledger entries,
  the invoice number and marks every delivery with the bill id. A delivery can therefore never be billed twice. Voiding
  the bill releases them again.
- A customer's balance shown in the app = ledger balance (billed − payments) **+** delivered-but-not-yet-billed milk.
- Receipts from customers, payments to suppliers and expenses are ledger vouchers; cash in hand is the cash account balance.
- Profit = delivered milk value + shop sales − milk purchases − expenses (cash-style, easy to understand). Milk is not
  stock-tracked by default (items have an optional "keep stock" switch), so a litres bought-vs-sold comparison is shown
  instead.

## Language

- `js/i18n/ur.js` and `js/i18n/en.js` hold every text (same keys). `t('key', {vars})` in `js/core/i18n.js`; static HTML uses
  `data-i18n*` attributes. The language is saved in settings; switching re-translates the screen immediately.
- Urdu switches the page to `dir="rtl"` and enables the Bootstrap **RTL** stylesheet (English re-enables the LTR one). Layout
  code uses logical CSS properties. Urdu is drawn with **Jameel Noori Nastaleeq** (`fonts/`, only for Urdu characters);
  digits stay Western (0-9) as most Pakistani shop owners use them.
- Receipts and bills print in the chosen language (Urdu is rasterised for ESC/POS thermal printers, see below).

## Architecture

```
index.html              App shell (splash, login, layout)
css/app.css             Theme, big-touch components, RTL-safe, animations
js/app.js               Boot, auth gate + session expiry, router (lazy-loaded screens), language switch, SW updates
js/config.js            APP_ID, login API URL, support phone, versions
js/core/                i18n, settings (LocalStorage), UI helpers, shared views, utils
js/i18n/                ur.js, en.js
js/db/                  IndexedDB wrapper (atomic multi-store transactions) + schema
js/services/            auth, catalog (in-memory search index), posting engine, milk (delivery / bills / profit), backup
js/modules/             home, delivery, customers, bills, shop, buy, money, profit, products, settings, backup, dialogs
js/printer/             ESC/POS encoder, receipt builder, Bluetooth / RawBT / browser printing
```

### Storage

| Where | What |
|---|---|
| IndexedDB `doodhwala_pos` | products, customers (with their milk schedule in `customer.milk`), suppliers, accounts, sales (+ lines; monthly bills have `sale.bill`), purchases, returns, vouchers, **ledger entries**, stock moves, **deliveries**, audit log, counters |
| LocalStorage | settings (shop, language, printer, theme), `doodhwala.pref.*`, `doodhwala.session` (`{ token, expiresAt, username }`), the shared phone id `minipos.deviceId` |

**Shared origin.** Apps hosted under the same GitHub Pages user share IndexedDB / LocalStorage / Cache Storage, so
everything is namespaced with `CONFIG.APP_ID` (`doodhwala`): database, keys and caches. If you copy this app for another
shop on the same origin, change `APP_ID` in `js/config.js` **and** `service-worker.js`.

### Authentication

Unchanged eposwala login (`POST {AUTH_API_BASE}/login` with `username`, `password`, `deviceId`): internet is needed to sign
in, one account is bound to one phone, the session `{ token, expiresAt, username }` lets the app work offline until it
expires. All error codes are shown in Urdu / English. The CORS note applies: the API must allow the origin the app is
served from (see below).

## Setup

```bash
python -m http.server 8765
```

Open http://localhost:8765. Login from any origin other than `https://eposwala.com` needs the API to send
`Access-Control-Allow-Origin` for that origin. For local UI testing without the API you can create a session in the browser
console: `localStorage.setItem('doodhwala.session', JSON.stringify({token:'x', username:'test', expiresAt: Date.now()+864e5}))`.

**Deploy** on GitHub Pages (branch `main`, root; `.nojekyll` is included) or any HTTPS host. HTTPS is required for the
service worker and Web Bluetooth. **Bump `VERSION` in `service-worker.js` whenever any file changes**; installed apps update
the next time they are opened online.

## Backup & restore

JSON file (`doodhwala-backup-….json`) with a SHA-256 checksum, validated before anything changes (structure, versions,
record counts, ledger balance). Restore either **merges** (adds missing / newer records) or **replaces** everything (type
`REPLACE` to confirm). The home screen reminds the owner after 7 days without a backup. Ask owners to send the file to
themselves on WhatsApp or Google Drive.

## Printing

Browser print (any printer, PDF), Web Bluetooth BLE ESC/POS printers (Chrome/Edge on Android and desktop), and RawBT
(Android, classic Bluetooth). Urdu lines are rasterised with Jameel Noori Nastaleeq so thermal printers can print them.
A monthly bill prints the items, this month's total, previous balance and total due.

## Known limitations

- **Data lives on the phone.** There is no cloud sync and no second device or delivery-boy login. Use backups.
- Milk bills are monthly per customer; a customer's rate changes only affect later deliveries (rates are stored on each
  delivery).
- Profit is cash-style (income − purchases − expenses); there is no cost-of-goods or stock valuation for milk.
- Engine-level validation messages inside `services/posting.js` (rare internal errors) are still in English.
- No automatic WhatsApp sending: the app opens WhatsApp with the Urdu bill text and the owner taps send (WhatsApp does not
  allow bulk sending from a web app).
- iOS has no Web Bluetooth; use browser print / AirPrint there.
