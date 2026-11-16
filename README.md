# Ana Dépôt — storefront & administration (`ana-depot-web`)

Next.js 16 · React 19 · TypeScript (strict) · Tailwind CSS v4 · lucide-react. **Authentication is real** (Supabase Auth, see
[docs/authentication.md](docs/authentication.md)); **business data is not yet server-backed**: catalog, stock, reservations, payments and
pickup settings still live in this browser's `localStorage` as clearly labelled demo data until the Spring Boot API endpoints exist
(`../ana-depot-api`). Payments, notifications and storage integrations are not implemented. Everything simulated is labelled in the UI.

```bash
npm install
cp .env.example .env.local   # fill in the Supabase URL + public key and NEXT_PUBLIC_API_BASE_URL (see docs/authentication.md)
npm run dev            # http://localhost:3000  (redirects to /fr or /ht)
npm run build && npm start
npm run lint && npm run typecheck && npm test
```

## The product
**Ana Dépôt** (`ana-depot`) is a single-seller **general-merchandise** retailer and wholesaler. The catalog is not tied to a trade
(construction materials, shoes, bed linen, furniture, mattresses, household goods… are only illustrative examples): the seller defines
categories and their attributes. It sells **retail and wholesale** from the same catalog — any product can have quantity-based wholesale
price tiers, nothing is wholesale-only. The home page says so (hero: "Tout ce qu'il vous faut, au même endroit." / "Tout sa w bezwen, nan
yon sèl kote.") and no category dominates the hero or the featured products. Reserve online → store reviews (accept/reject) → store marks ready → customer visits → pays **cash at the store** → collects.
No online payment, no delivery. MonCash and NatCash appear as **"Bientôt disponible" / "Talè konsa"** and cannot be selected.
Languages: French (`/fr`, default) and Haitian Creole (`/ht`). Launch market Haiti; the code is not Haiti-specific (`src/config/market.ts`).

## Customer site (`/fr|/ht/…`)
`/` · `/products` · `/products/[slug]` · `/search` · `/cart` · `/reserve` (guest, 3 steps) · `/reserve/confirmation/[ref]` ·
`/reservations` (lookup: reference **+ phone**) · `/reservations/[ref]` · `/sign-in` `/register` `/forgot-password` `/reset-password`
`/verify-email` (real Supabase flows; accounts are optional — browsing, cart, guest reservations and tracking never need one) ·
`/account` `/account/reservations` `/account/profile` (server-protected: valid Supabase session required) · `/info/[slug]`.

## Administration (`/fr|/ht/admin/…`, noindex)
**Access:** Supabase session **and** `staff: true` from the backend (`GET /api/v1/me`), checked on the server for every `/admin/**` page (deny by default; no public admin registration).
`/admin/sign-in` · `/admin` dashboard (reservations / payments received / outstanding / collected, HTG and USD apart; quick actions) · `/admin/reservations` (search, status, date, sort, pagination; table → cards on mobile) ·
`/admin/reservations/[ref]` (accept, reject, ready, record payment, collect, cancel, expire, notes, change pickup, history) ·
`/admin/pickup-settings` (address, contact, hours, bilingual instructions, enable/disable, hold period, preview, history) ·
`/admin/products` (list, filters, activate/deactivate) · `/admin/products/new` and `/admin/products/[id]` (guided form: category → basics → images →
category attributes → optional variants → price → wholesale tiers → stock → review; save draft / publish) ·
`/admin/categories` (+ `new`, `[slug]`: bilingual name, image, active, **attribute definitions**) ·
`/admin/inventory` (on hand / reserved / available, add · reduce · recount with reason, movement history) ·
`/admin/customers` (+ `[key]`; derived from reservations) · `/admin/payments` (recorded payments, filter by currency, balances still due per currency) ·
`/admin/reports` (period + metric tables, HTG and USD columns, reservation value ≠ payments received) · `/admin/settings` (only decided settings are
editable; everything else is shown "not configured"/"decision pending", nothing invented). **Every admin page carries a "not connected to the server" notice**
because its data is browser-local demo data.

## Catalog, pricing and stock model
- **Categories define attributes** (`AttributeDef`: select / text / number, required, filterable, usable as a variant axis). The product form,
  the PDP specification table and the catalog filters are all generated from them — no product field is hardcoded to a category.
- **Products** have a selling unit (unit, pair, pack, box, set, meter, kilogram), images (upload, primary, reorder, remove), optional variants
  (own SKU / price / stock), lifecycle `draft → active ↔ inactive` (publishing re-validates; only `active` is visible and reservable).
- **Currencies (confirmed: HTG and USD at launch)**: every product has an explicit currency (`pricing.currency`). Retail, sale, wholesale tiers
  and variant prices all share it. There is **no exchange rate and no conversion anywhere**: amounts of different currencies are never added,
  compared or merged. Cart and reservations keep **one total per currency**; a payment is recorded in the currency it was received in and settles
  only that currency's balance (`balances()` in `lib/reservations/workflow.ts`). Money is always displayed with its ISO code ("1 800,00 HTG",
  "28,50 USD"). The catalog can be filtered by currency; price ranges need a selected currency; price sorting is grouped by currency. The admin list
  has no sort by amount for the same reason. The seller picks the currency when creating a product (`market.defaultProductCurrency` only pre-selects it).
- **Pricing**: retail price, optional sale price, minimum order quantity, optional **per-product wholesale tiers** ("from N units, price P"). Tiers are
  validated (ascending quantities, falling prices, below the base price). Variants with their own price scale the tiers proportionally.
  The product page, cart and reservation lines show the price that applies to the chosen quantity and how many more units unlock the next tier.
  The "wholesale" thresholds are never hardcoded.
- **Stock**: `available = on hand − reserved`. Reserved = open reservations (pending, confirmed, ready); rejecting/cancelling/expiring releases them;
  **collecting** deducts physical stock with a `sale` movement. Adjustments are movements with a reason. Low-stock only exists when the seller sets a
  threshold on the product. Products can be "not tracked" (manual availability).
- Code: `src/lib/catalog/*` (pure, tested), `src/lib/stores/catalog-store.ts` (demo persistence), `src/lib/api/catalog-admin.ts` (admin API boundary),
  `src/lib/mock/catalog-seed.ts` (**sample** categories/products, all marked as examples), `src/features/admin/{products,categories}`.

## Demo behaviour (try it)
| What | How |
|---|---|
| Data | Everything lives in this browser's `localStorage`: sample reservations in every status **and the catalog** (products, categories, stock movements), so what the seller edits in the admin shows in the storefront of the same browser. Admin menu → "Réinitialiser les données de démonstration" |
| Sample catalog | 16 invented products (metal, shoes, bedding, furniture, household) with wholesale tiers, variants, a draft, an inactive one, an out-of-stock one and an untracked one. Most are priced in HTG; the sample shoes and bed linen are in USD to demonstrate mixed currencies. Prices and stock are **not real** |
| Sign-in / sign-up / recovery | **Real Supabase Auth** — no demo credentials exist any more. Without Supabase configuration every auth screen says "not configured" instead of pretending |
| Account reservations | The account page lists browser-local sample reservations whose e-mail matches the signed-in user (demo data, labelled) until the API links reservations to customer profiles |
| Track a reservation | sample: `ANA-PEND01` + phone `0000 0101` |
| Notifications | Staff actions say "le client sera notifié (démonstration : aucun message n'est envoyé)" — nothing is sent |
| Pickup address/hours/phone | **Fake sample values** ("exemple"). Replace in Admin → Lieu de retrait |

## Money contract (for the API)
Java: monetary amounts must be `BigDecimal` (never `float`/`double`) with an ISO 4217 code stored next to every amount (price, reservation line, payment).
Totals are computed per currency, after validating that the lines being summed share it. The frontend contract is integer **minor units** + code
(`Money` in `src/lib/money.ts`); HTG and USD both have 2 minor digits. Reservations must snapshot unit, quantity, applied unit price, currency,
applied wholesale tier and line total (the demo does: `ReservationLine`).

## Replacing the demo stores with the API
`src/lib/api/http.ts` is the typed HTTP client (bearer token, RFC 9457 problem parsing with `code`, `Idempotency-Key`, `X-Correlation-Id`) — present
and tested but not yet used by the data paths. Per capability: implement the endpoint in `../ana-depot-api`, then replace the body of the matching
function in `src/lib/api/*` with a call through the client (keep signatures and error codes), drop its use of the demo store in `src/lib/stores/*`
and remove the "not connected" notice for that module. Reservation submit, payments and stock adjustments must send an `Idempotency-Key`.

## Backend contract
Replace bodies in `src/lib/api/*` with HTTP calls; keep signatures and error codes. `src/lib/reservations/workflow.ts` documents
the rules the API must enforce; `customer-view.ts` is the shape customer endpoints must return (no internal notes).

## Not implemented on purpose
Currency conversion / exchange rates (deliberately absent), price visibility rules (hiding wholesale prices behind an account), wholesale customer accounts, pack/box unit conversions, per-customer prices, delivery,
online payment, real image storage (uploads are downscaled to data URLs in localStorage), real inventory counts per location, server-backed admin data (see "Replacing the demo stores"), customer-profile linking of reservations, registered-vs-guest customer distinction, audit-history screens (need the API), staff roles/permissions (undecided).

## Decisions needed from the business owner
_Resolved: the currencies are **HTG and USD** (confirmed). A conversion between them is **not** planned: if ever wanted, it needs an explicitly configured conversion policy kept separate from the original product price._

1. **Wholesale visibility**: who may see and use wholesale prices — everyone (as now) or approved accounts?
2. **Business-wide minimum order quantity**: per-product minimums exist; is there also a global one?
3. **Selling units**: the final list (now unit, pair, pack, box, set, meter, kilogram).
4. **Pack/box conversion**: do packs and boxes need conversion rules to units? (none implemented)
5. **Low-stock threshold policy**: per-product values chosen by the seller today; is there a business policy?
6. **Ready-reservation hold**: how many days is a "ready" reservation held? (unset ⇒ reservations never expire automatically).
7. **Pickup**: real address, hours, phone/e-mail, contact and pickup policy text (fr + ht). None were invented.
8. **Customer notifications**: channel (SMS / e-mail / WhatsApp) and who sends it; guests may have only a phone number.
9. **Payments at pickup**: who may record a payment, and are partial payments allowed? (the demo allows partial payments per currency; a receipt reference is optional).
10. **Cancellation**: can a customer cancel after "ready"? (currently yes, until any payment is recorded).
11. **Staff roles and permissions**: one staff role today. Are owner/staff/cashier distinctions needed?
12. **Legal pages**: returns, privacy, terms are placeholders.
13. **Haitian Creole**: have a native speaker review every `ht` string (written carefully, not reviewed) — including the new currency wording ("monnen", "to chanj").

## Remaining work
Real APIs (catalog, inventory, reservations) with server-side authorization on `/api/v1/admin/**` — the API must
re-check price tiers, stock and reservation rules (the frontend only demonstrates them) · real notifications · real image storage ·
store settings · additional countries/currencies/payment methods (MonCash, NatCash) · SEO (sitemap, structured data) ·
E2E tests in CI · cache strategy (`use cache`) once data is remote.
# ana-depot-web
