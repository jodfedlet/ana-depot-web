# Storefront ↔ backend integration

The **customer storefront** (browse, search, product pages, cart, guest reservation, tracking, customer account) talks to the real Spring Boot API
(`../ana-depot-api`, contract: `../ana-depot-api/docs/api.md`). The **administration** is connected separately (see `admin-integration.md`).

```
Browser (Next.js storefront) ──HTTPS+CORS──▶ Spring Boot API ──▶ Supabase PostgreSQL
        │                                         ▲
        └── Supabase Auth (session cookie) ───────┘ (the API verifies the Supabase JWT; authorization is the API's)
Product images: Cloudflare R2 public URLs returned by the API (the browser only reads them).
```

## Where things live
| Concern | Code |
|---|---|
| Wire types of the API | `src/lib/api/dto.ts` (only what the storefront reads) |
| One function per endpoint | `src/lib/api/public.ts` (anonymous client for public reads, token client for account calls) |
| DTO → view model | `src/lib/api/map-catalog.ts`, `map-reservation.ts`, `decimal.ts` (decimal strings → integer minor units, no floats) |
| Data hooks | `catalog-hooks.ts` (categories, listing/search, product page), `pickup-hooks.ts`, `reservation-hooks.ts`, `account-hooks.ts`, `cart-check.ts`, `use-resource.ts` |
| Errors | `src/lib/api/errors.ts` (stable `code` → `apiErrors.*` message; status fallback; uncertain-outcome detection) |
| HTTP client | `src/lib/api/http.ts` / `client.ts` (timeout, `Retry-After`, correlation id, `Idempotency-Key`) |
| Terms gate | `src/config/terms.ts` |
| Browser-side state (only this) | cart `ana.cart.v4` (localStorage); guest access + just-submitted answer + pending idempotency key (sessionStorage, this tab only) |

## Environment (all `NEXT_PUBLIC_*` are inlined at build time; none is a secret)
| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | API origin the **browser** calls. The API must list the storefront origin in `ANA_CORS_ALLOWED_ORIGINS` (exact origins, no wildcard, no cookies). |
| `API_BASE_URL` | optional server-only override (internal address) used by server code (admin gate). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `…_ANON_KEY`) | Supabase Auth (public key only; the service-role key is never used here). |
| `NEXT_PUBLIC_TERMS_VERSION` | label of the reservation terms in force. **Must equal the API's `ANA_TERMS_VERSION`.** Unset ⇒ the acknowledgement is not offered and reservations cannot be sent (see below). |
| `NEXT_PUBLIC_TERMS_URL` | optional link to the published terms (a local path or an `https://` URL). |

## Local development
1. API + Supabase + (optionally) MinIO as in `../ana-depot-api/docs/local-supabase.md` and `../ana-depot-api/README.md`; seed with `e2e/storefront/seed.py`.
2. `.env.local` with the values above (never commit it). `npm run dev` (or build + start).
3. Without `NEXT_PUBLIC_API_BASE_URL` every data screen shows a clear "not connected" error state; nothing falls back to fake data.

## Behaviour (what the code guarantees)
**Catalog & search.** The list, its order, totals and paging come from `GET /products` / `/products/search`; the browser sends the URL's filters (`q`, `category`,
`currency`, `min`/`max`, `wholesale`, `stock`, `attr`, `sort`, `page`) and renders the page it gets. It never downloads the catalog or searches it locally. Suggestions in the header are
debounced (300 ms, ≥ 2 characters, superseded requests aborted). The search box keeps the URL's query. Price filters and price sorting only exist **inside a chosen currency** (the API refuses
them otherwise); HTG and USD are never compared. Facets are the category's filterable attributes **without counts** (the API returns none); there is **no brand filter** (no brand list endpoint).
*Haitian Creole search = accent-folded prefix matching only: no stemming, synonyms or typo tolerance, and the empty state says so.*

**Prices & availability.** One product, one price block per currency (retail, sale, wholesale tiers, minimum order, per-currency variant prices); amounts are parsed exactly from decimal strings;
an unreadable price removes that currency (never an invented price). Availability comes from `availability` + `availableQuantity` (shared stock); on-hand/reserved never reach the page.

**Cart.** A temporary selection in `localStorage` (`ana.cart.v4`; the old demo cart is deleted, not migrated). Its prices are an **estimate**. `useCartCheck` re-reads every product from the API on the cart and
reservation pages and reports: unavailable, insufficient stock (HTG and USD lines of one item share one stock), price changed (before → after; the cart is updated only when the customer asks). A blocked cart
cannot be submitted. Subtotals are per currency; there is no combined total and no conversion.

**Guest reservation.** `POST /reservations` with identifiers, quantities, currencies, contact, locale and the acknowledgement — **never a price or total**; the server prices, reserves stock and snapshots.
One `Idempotency-Key` per attempt, kept (sessionStorage) and reused only if the **same** request is retried; a changed request gets a new key; the button locks while sending (double click ⇒ one request).
After a timeout/lost connection the outcome is shown as **uncertain** and "Retry" reuses the key (the server returns the original reservation, never a duplicate); the cart is kept until the server answered.
The confirmation page shows the server's own 201 answer (kept for the tab) and never says confirmed/paid/ready unless the status says so. Pickup (`GET /store/pickup`): `available` shows the real address/hours;
`disabled` shows the owner's message and blocks; `not_configured` blocks; nothing is hardcoded.

**Terms.** The backend stores the acknowledgement time and **its own** `ANA_TERMS_VERSION`. The storefront needs to know a terms version exists: `NEXT_PUBLIC_TERMS_VERSION`. Without it the checkbox is replaced by an
explanation and sending is disabled — nobody can accept terms that do not exist. No legal text is bundled; the existing "before you reserve" bullets are a process summary, not terms.
*Gap:* the API exposes no public endpoint for the terms version/text, so the two variables must be kept equal by hand.

**Tracking.** `POST /reservations/lookup` (reference + phone in the body). Wrong phone, unknown reference and too-short phone are the same message. The phone typed (or used to submit) is kept for **this tab only**
(sessionStorage) so the page can ask the server again; nothing about the reservation is rebuilt locally. The API response carries no internal notes, staff identities or ledger entries; customer-visible notes appear in the history.
There is no cancel button (`canCancel` is always false: no cancellation policy). `expiresAt` is shown only when the server sets one.

**Accounts.** Supabase Auth (cookie session, supported UI block — unchanged). Account pages call `/me/profile`, `/me/reservations` with the token; reservations made while signed in are linked to the account, guest ones never
are (even with the same phone/e-mail). An expired or missing session is reported ("session expired", sign in again) — a signed-in call **never** degrades into a guest call, and public reads carry no token at all
(the API answers 401 to an expired bearer token even on public endpoints). Authorization is the API's (`staff` from `staff_members`), never `user_metadata`.

**Images.** `images[].url` as returned (the configured public R2 domain). Remote http(s) images are served by their host (`unoptimized`, because the domain is deployment configuration, not build configuration); a missing or failing
image becomes a neutral placeholder; only http(s) URLs are accepted.

**Errors.** `apiErrorKey` maps the API's stable `code` to a French/Creole message; unknown codes fall back by status (401/403/404/429/5xx); raw `detail` and stack text are never shown. Network/timeout (10 s) and 429 have their own
messages; every data screen has a retry. Writes are never retried automatically.

## Tests
| Layer | Command | Proves |
|---|---|---|
| Unit/contract (**mocked** API fixtures shaped like `api.md`) | `npm test` | mappers, exact decimals, query building, request wiring (no token on public reads, no prices sent, no guest fallback), error mapping, cart revalidation, idempotency bookkeeping, terms gate. **Does not prove the real backend.** |
| Real stack (**local**: real API + local Supabase + MinIO) | `npm run e2e:storefront` | the journeys in a real browser at 1280 px and 390 px — see `e2e/storefront/README.md` |
| Auth UI | `npm run e2e:stub`, `e2e:unavailable`, `e2e:real` | unchanged (see `authentication.md`) |

## Localization honesty
All new customer strings exist in French and Haitian Creole (the Creole type-checks against the French shape). **The Creole has not been reviewed by a native speaker** (error messages, terms wording, search empty state, cart
revalidation, tracking labels) and must be before launch.

## Open items
See the final report of the phase and `../ana-depot-api/CLAUDE.md` (open business decisions: wholesale visibility, minimum order, units, hold period, cancellation policy, notification channel, payments policy, legal text).
