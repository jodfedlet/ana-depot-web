# ana-depot-web — Ana Dépôt (storefront + administration)

@AGENTS.md

Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4. Single seller, physical goods, **general merchandise** (never position it
as a furniture/hardware/household specialist — the hero and home must stay category-neutral). Currencies: **HTG and USD** (decided).
**Retail + wholesale** (per-product quantity price tiers, never wholesale-only). **Commerce model: reservation-first.** Customer reserves online → store reviews → store marks it ready → customer pays (cash at pickup, or online with hosted Stripe Checkout once the store's Stripe account is configured; OFF by default) → collects. There is NO delivery. Launch market Haiti; languages `fr` and `ht`.
The **customer storefront is connected to the real backend** (`../ana-depot-api`, Spring Boot): catalog, search, pickup, cart checks, guest reservations, tracking, customer account (`docs/storefront-integration.md`). The **administration is connected to the real admin APIs** too (`/api/v1/admin/**`, Phase 4; `docs/admin-integration.md`). No demo business data is left.
Design: `docs/design-system.md` (read before changing UI). Business decisions still open: README.

## Commands
`npm run dev|build|lint|typecheck|test` · `node scripts/generate-sample-images.mjs` (sample artwork) · Cloudflare Workers: `npm run cf:build|cf:preview|cf:deploy` and `cf:build:dev|cf:deploy:dev|cf:build:prod|cf:deploy:prod` (OpenNext, `wrangler.dev.jsonc` = the `ana-depot-web-dev` Worker; `docs/cloudflare-deployment.md`, read it before touching caching, `proxy.ts` or `revalidateTag`).

## Architecture
- `src/app/[locale]/…` — every page lives under `/fr` or `/ht` (`src/proxy.ts` redirects bare URLs: cookie → Accept-Language → `fr`).
  `(store)/` = customer site; `admin/` = administration (`admin/(app)/` behind the server-side staff gate; unauthenticated visitors go to `/auth/login?next=/admin`).
- `src/features/<area>` — screens: `home catalog product cart search reservations account auth info admin` (`admin/products`, `admin/categories` for catalog management).
  `src/components/ui|layout` — shared primitives. `src/lib` — pure logic/types. `src/i18n` — translations & helpers.
- **API boundary `src/lib/api/*`** (async, typed) is the only thing UI calls. Storefront: `public.ts` (one function per endpoint of `../ana-depot-api/docs/api.md`), `dto.ts`, `map-*.ts`, `*-hooks.ts`, `errors.ts`. **Never add a field, endpoint or status the API contract does not have; never send a price; never search/filter a downloaded catalog; never show success before the server confirmed.** Public reads use the anonymous client (no token). Staff calls live in `lib/api/admin/*` (`signedInClient`, typed DTOs, one function per staff endpoint, `useAdminResource`/`useAction`, idempotency keys via `lib/api/idempotency.ts`); the storefront must not import them. The only storefront browser state is the cart (`ana.cart.v4`) and tab-scoped sessionStorage (`lib/reservations/access-store.ts`, `pending-submit.ts`).
- **Authentication is real Supabase Auth** (`@supabase/ssr` cookies; `src/lib/auth/*`, `src/lib/api/auth.ts`). There are NO demo sessions any more —
  never reintroduce a fake sign-in, a "local session", or a success that Supabase did not confirm. Full guide: `docs/authentication.md`.
  - Identity ≠ authorization. Supabase says WHO; the backend (`GET /api/v1/me` → `staff`) says what they may do. Admin access = verified session + `staff === true`,
    decided on the SERVER in `features/admin/admin-gate.tsx` (default deny; backend unreachable ⇒ denied). Account pages: `features/account/account-gate.tsx`.
    Layouts do not re-run on client navigation, so the backend must authorize every `/api/v1/admin/**` call itself. Never use `user_metadata` for authorization.
  - The one authorization boundary is `lib/auth/authorization.ts` (`canAccessAdmin`, `hasPermission`). Roles/permissions are an open business decision: do not invent them.
  - The client session mirror is `lib/auth/auth-store.ts` (`useSession()`): "loading" until Supabase confirms; never "signed in" from a raw cookie.
  - **Auth UI = the Supabase UI "password-based-auth" block, source-copied in `src/components/auth-block/` (routes `/auth/{login,sign-up,sign-up-success,forgot-password,update-password,error,callback}`).**
    Never write another sign-in/sign-up/recovery form, never add `@supabase/auth-ui-react`, never link to a hosted login or the dashboard. Invalid/missing config renders `AuthUnavailable` (no inputs).
  - Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public), `NEXT_PUBLIC_API_BASE_URL` (browser + server; all `NEXT_PUBLIC_*` are inlined at BUILD time),
    optional server-only `API_BASE_URL`. The service-role key is never used by this app.
  - Privacy: never show whether an address has an account (sign-up/sign-in/recovery/resend are uniform; `user_already_exists` counts as success). Callback redirects are RELATIVE.
  - Checks: `npm test` (mocked/unit), `npm run e2e:stub` (fake Supabase), `npm run e2e:unavailable` (config missing), `npm run e2e:real` (local Supabase + real API; see `docs/authentication.md` and `../ana-depot-api/docs/local-supabase.md`).
  - `src/lib/api/http.ts` is the typed client for the real API. Admin pages never keep business data in the browser (no demo store, no localStorage records).

## Reservation and admin domain (the part that must stay correct)
- The BACKEND is the rule engine: statuses, `allowedActions`, prices, stock, balances. The UI never recomputes a business rule, never shows success before the server confirmed, and never invents a role,
  refund, cancellation policy, expiry or FX conversion. Flow: pending → accepted → ready for pickup → collected; reject/cancel need reasons; payments only while READY_FOR_PICKUP; collect needs PAID and deducts stock once; cancelling keeps payments on the ledger (no refund flow).
- Staff calls: `lib/api/admin/*` (see above). Writes use `useAction` (one in-flight write) and optimistic concurrency by `version` (409 `concurrent_update` ⇒ reload the record, say nothing was overwritten);
  an uncertain retry (timeout/network/≥502) of the SAME payload reuses its `Idempotency-Key` (payments, stock adjustments), a changed payload gets a new one.
- Errors: 401 ⇒ sign in again; 403 ⇒ fail closed (no data); 404/409/422 (`fieldProblems` marks inputs)/429/5xx all have fr+ht messages (`apiErrors.*`, `fieldErrors.*`): add both languages with every new code.
- Pure, tested form logic: `lib/admin/{category-form,product-form,pickup-form,money,slug}.ts`. Customers: guests are corrected in place and never merged; registered customers are read-only (`customer_managed_by_owner`).
- **Pickup snapshots:** each reservation stores its own pickup snapshot; changing pickup settings only affects NEW reservations.
- **Customer vs staff data:** `lib/reservations/customer-view.ts` is the customer view model (from the API's `CustomerReservationView` via `lib/api/map-reservation.ts`); it cannot express internal notes/staff names. Guests need reference **and** phone (checked by the SERVER; `reservations/access-store.ts` keeps them for the tab only).
- A customer may cancel a pending/confirmed reservation from the tracking page (`canCancel` is the backend's answer; reason required). A cash payment above the balance is refused (`overpayment_not_allowed`). Card money on a rejected/cancelled/expired reservation shows "refund due" (refunds are made in the Stripe dashboard).
- Public pages must never receive administration wording: `getStorefrontMessages` (tested).
- Pickup disabled/not configured ⇒ the SERVER refuses (422) and the form is blocked too. MonCash/NatCash are "Bientôt disponible", disabled, never stored on a reservation.
- Images: ticket -> direct PUT to the presigned URL (R2 in production, MinIO locally) -> complete.
- Browser suites: `npm run e2e:roles` (the three roles), `e2e:cancel` (customer cancellation), `npm run perf:concurrency` (contention invariants + read load), `npm run e2e:admin` (`e2e/admin/README.md`), `e2e:a11y` (axe, 390/1280, fr+ht), `e2e:team` (team invitations + staff second factor; needs the API with `ANA_STAFF_REQUIRE_MFA=true`, the other suites need it off).
- **Team and second factor:** `features/admin/team.tsx` (invite with a one-time code shown once, remove/restore access), `features/account/join-team.tsx` (code in the URL fragment), `features/admin/staff-mfa.tsx` (Supabase TOTP; the gate shows ONLY this step while `/me.mfaRequired`). Roles are fixed (D14): OWNER / MANAGER / STAFF; `lib/admin/access.ts` mirrors the server's endpoint table so menus and pages only offer what the role may do (the server decides). Second factor: recovery codes (`features/admin/security.tsx`, "I lost my authenticator" on the verification screen).

## Catalog domain
- Catalog data (storefront and admin) comes from the API; `lib/catalog/model.ts` keeps only `unitIds`/`PriceTier`/`Pricing`. Category `attributes` drive the product form, PDP specs and filters — never hardcode fields per category.
- Variants = combinations of the category's `variantAxis` CHOICE attributes; a variant's own price ignores the product sale price. Stock is registered per product/variant, separate from the product.
- Catalog lists paginate (12/page): tests must search (`?q=`) rather than assume a product is on page 1.

## Currency rules (HTG + USD, decided — do not re-ask)
- A product has one price set PER currency (see "Per-currency pricing" below); retail/sale/tiers of one set share its currency. `PricingSnapshot`, cart lines and reservation lines carry the currency.
- **No exchange rate, no conversion, no cross-currency arithmetic.** `addMoney` throws on mixed currencies; totals use `sumByCurrency` (cart:
  `cartSubtotals`, reservation: `totals: Money[]`). Never reintroduce a single `total`.
- Payments: `recordPayment` needs `currency` (must be one of the reservation's); `balances(r)` is per currency; status is `paid` only when every
  currency is settled. Collection requires `paid`.
- Display always through `formatMoney`/`MoneyText`/`MoneyTotals`/`MoneyRows` (ISO code shown). Do not hand-format money, do not hardcode "HTG"/"USD".
  The only currency literals live in `SUPPORTED_CURRENCIES` (`lib/money.ts`) and `market.defaultProductCurrency` (form pre-selection).
- Catalog: `currency` filter; price min/max only with a selected (or the only) currency; price sort groups by currency. Admin reservation list has no amount sort.
- Money parsing uses decimal-exponent shifting (`majorToMinor`), not `x * 100`.

## Per-currency pricing (one product, many currencies)
- A product has at most one price set per currency (HTG, USD or both), each with its own retail, sale, minimum order and wholesale tiers; a variant may override retail per currency. Stock is ONE position shared by every currency. A missing currency is never generated.
- Customer view: `Product.offers` (one per currency; `price/pricing/...` are the primary-currency view) and `lib/catalog/offers.ts#inCurrency`. The cart keys lines per currency (`lineKey`) and caps the SUM of HTG+USD lines at the stock.
- Admin form: one price set per currency (`lib/admin/product-form.ts`), field errors keyed `prices.<CUR>.*`.

## i18n rules
- No user-facing literals in components: use `useT()` (client) / `getT(locale)` (server). `fr.ts` defines the shape; `ht.ts` is typed
  against it, so a missing key fails `tsc`. Keep `{placeholders}` identical (tested). Plural leaf = `{one, other}`.
- Admin-authored customer text is bilingual (`LText {fr, ht}`, `lib/localized.ts`) and resolved with `useLText()`. Customer-visible
  notes are written in the CUSTOMER's language (`reservation.locale`); templates in `lib/reservations/templates.ts`.
- Links/routers: use `@/i18n/link` `Link` and `useLocaleRouter` (locale-less hrefs like `/products`), never `next/link` directly.
- Dates: `i18n/format.ts` (Intl has no `ht`). Money: see "Currency rules" above — integer minor units + ISO code, never converted; sample prices are illustrative.
- Haitian Creole strings need native review before launch.

## Other rules
Never present mock behaviour as real. Don't invent addresses, hours, phones, policies, prices, reviews.
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
