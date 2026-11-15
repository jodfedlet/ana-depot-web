# ana-depot-web — Ana Dépôt (storefront + administration)

@AGENTS.md

Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4. Single seller, physical goods, **general merchandise** (never position it
as a furniture/hardware/household specialist — the hero and home must stay category-neutral). Currencies: **HTG and USD** (decided).
**Retail + wholesale** (per-product quantity price tiers, never wholesale-only). **Commerce model: reservation-first.** Customer reserves online → store reviews → customer visits → pays cash in
person → collects. There is NO online payment and NO delivery yet. Launch market Haiti; languages `fr` and `ht`.
Backend (`../ana-depot-api`, Spring Boot) is **not** integrated: everything is a clearly marked demo.
Design: `docs/design-system.md` (read before changing UI). Business decisions still open: README.

## Commands
`npm run dev|build|lint|typecheck|test` · `node scripts/generate-sample-images.mjs` (sample artwork).

## Architecture
- `src/app/[locale]/…` — every page lives under `/fr` or `/ht` (`src/proxy.ts` redirects bare URLs: cookie → Accept-Language → `fr`).
  `(store)/` = customer site; `admin/` = administration (`admin/sign-in` standalone, `admin/(app)/` guarded shell).
- `src/features/<area>` — screens: `home catalog product cart search reservations account auth info admin` (`admin/products`, `admin/categories` for catalog management).
  `src/components/ui|layout` — shared primitives. `src/lib` — pure logic/types. `src/i18n` — translations & helpers.
- **API boundary `src/lib/api/*`** (async, typed) is the only thing UI calls. `src/lib/mock/*` is SAMPLE DATA, imported only by
  `lib/api` and the demo stores. `lib/api/reservations.ts` + `lib/stores/*` are the DEMO "backend" (localStorage); replace the
  bodies with HTTP calls — signatures and error codes are the contract.
- No Supabase SDK in the frontend. Demo sessions: customer (`session-store`), staff (`admin-session-store`; email `admin@…`).
  Frontend gating is UX only — the API must authorize every request.

## Reservation domain (the part that must stay correct)
- `lib/reservations/workflow.ts` is the single rule engine (pure, tested): pending_review → confirmed → ready_for_pickup → collected;
  reject/cancel need reasons; payment only when ready; collect needs payment = paid + confirmed handover; cancelling a promised
  reservation needs an operational check; expiry only by configured policy (`holdPeriodDays`, null = none; never hardcode one).
- **Pickup snapshots:** each reservation stores its own `PickupSnapshot` (location + instructions). Changing global settings
  (`lib/api/reservations.savePickupSettings`) only affects NEW reservations. Per-reservation change = `changePickup` action + event + history.
- **Customer vs staff data:** `lib/reservations/customer-view.ts` returns a separate `CustomerReservation` type with no internal
  notes/staff names. Customer screens must use it. Guests need reference **and** phone (`access.ts`); never expose by reference alone.
- Pickup disabled/not configured ⇒ `submitReservation` refuses (don't rely on the form). MonCash/NatCash are "Bientôt disponible",
  disabled, and never stored on a reservation.

## Catalog domain (`src/lib/catalog`, pure + tested)
- `CategoryRecord.attributes` (`AttributeDef`) drive the product form, PDP specs and filters — never hardcode fields per category. Ids/keys are stable; labels are `LText`.
- `ProductRecord`: `pricing` (retail, sale?, `minOrderQty`, wholesale tiers), optional `options`+`variants`, `inventory` (tracked + `onHand`, or manual availability), `status` draft/active/inactive.
- Price for a quantity = `pricing.ts` (`snapshotFor` → `unitPriceFor`). Variants with their own price scale tiers proportionally. UI never recomputes prices itself.
- Stock = `stock.ts`: `available = onHand − reserved` (reserved from open reservations). `submitReservation` re-checks status, minimum order and stock;
  `runReservationAction(collect)` deducts stock + writes a `sale` movement. Adjustments: `api/catalog-admin.adjustStock`.
- Validation (`draft.ts`, `category.ts`, `pricing.ts`) returns CODES; the UI renders `admin.products.errors.<code>` / `admin.categories.errors.<code>` — add a message in fr+ht when adding a code.
- The catalog lives in the demo store (`stores/catalog-store.ts`) and storefront components read it via hooks (`catalog/hooks.ts`) so admin edits are visible. The API replaces this.
- Catalog lists paginate (12/page): tests must search (`?q=`) rather than assume a product is on page 1.

## Currency rules (HTG + USD, decided — do not re-ask)
- Each product has `pricing.currency`; retail/sale/tiers/variant prices share it. `PricingSnapshot`, cart lines and reservation lines carry it.
- **No exchange rate, no conversion, no cross-currency arithmetic.** `addMoney` throws on mixed currencies; totals use `sumByCurrency` (cart:
  `cartSubtotals`, reservation: `totals: Money[]`). Never reintroduce a single `total`.
- Payments: `recordPayment` needs `currency` (must be one of the reservation's); `balances(r)` is per currency; status is `paid` only when every
  currency is settled. Collection requires `paid`.
- Display always through `formatMoney`/`MoneyText`/`MoneyTotals`/`MoneyRows` (ISO code shown). Do not hand-format money, do not hardcode "HTG"/"USD".
  The only currency literals live in `SUPPORTED_CURRENCIES` (`lib/money.ts`) and `market.defaultProductCurrency` (form pre-selection).
- Catalog: `currency` filter; price min/max only with a selected (or the only) currency; price sort groups by currency. Admin reservation list has no amount sort.
- Money parsing uses decimal-exponent shifting (`majorToMinor`), not `x * 100`.
- Demo store keys are versioned (`ana.demo.*.vN`): bump when a persisted shape changes.

## i18n rules
- No user-facing literals in components: use `useT()` (client) / `getT(locale)` (server). `fr.ts` defines the shape; `ht.ts` is typed
  against it, so a missing key fails `tsc`. Keep `{placeholders}` identical (tested). Plural leaf = `{one, other}`.
- Admin-authored customer text is bilingual (`LText {fr, ht}`, `lib/localized.ts`) and resolved with `useLText()`. Customer-visible
  notes are written in the CUSTOMER's language (`reservation.locale`); templates in `lib/reservations/templates.ts`.
- Links/routers: use `@/i18n/link` `Link` and `useLocaleRouter` (locale-less hrefs like `/products`), never `next/link` directly.
- Dates: `i18n/format.ts` (Intl has no `ht`). Money: see "Currency rules" above — integer minor units + ISO code, never converted; sample prices are illustrative.
- Haitian Creole strings need native review before launch.

## Other rules
Never present mock behaviour as real (DemoNotice/explicit wording). Don't invent addresses, hours, phones, policies, prices, reviews.
Tokens only (`globals.css`); no raw hex. Accessibility: labelled controls, 44px targets, focus visible, errors via `aria-describedby`.

## Next.js 16 gotchas (`cacheComponents: true`)
- `searchParams`/`params`/`usePathname()`/`useSearchParams()` outside `<Suspense>` fail the build. Don't call `usePathname` in
  layout-wide components (language selector reads `window.location` on click).
- `generateMetadata` that awaits `params` blocks routes with on-demand segments: keep root/admin layout metadata static; give
  `[reference]` routes a `generateStaticParams` placeholder.
- Server → Client props must be serializable: **no functions** (a function prop crashed the catalog once — pass hrefs/data).
- `error.tsx` gets `retry`. `next/image`: `loading="eager"`/`fetchPriority`, not `priority`. Run `npx next typegen` from the PROJECT ROOT
  (running it elsewhere creates stray `.next`/`tsconfig.json` copies). If styles vanish: `rm -rf .next`.
- Kill servers by port (`fuser -k 3100/tcp`), not `pkill -f`. A dev server may already be on :3000.

Backend instructions live in `../ana-depot-api/CLAUDE.md` (Ana Dépôt API; domain, schema and API contract in `../ana-depot-api/docs/`).
