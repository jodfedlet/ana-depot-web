# Installable app (PWA) and offline behaviour

Ana Dépôt is installable (Android/desktop Chromium: install card; iPhone Safari: "Add to Home Screen" hint) and keeps a small, deliberate offline experience.
It is a **reservation-first** shop: offline never means "pretend". Nothing is queued, replayed or faked, and prices/availability read offline are always labelled as possibly old.

## Parts
| Piece | File |
|---|---|
| Web app manifest (`/manifest.webmanifest`) | `src/app/manifest.ts` — name Ana Dépôt, `standalone`, scope/start_url `/`, theme `#0f4640` = `--color-brand-700`, background `#fbf9f6` = `--color-canvas` (a manifest cannot use CSS variables) |
| Icons | `public/icons/icon-{192,512,maskable-512}.png`, `src/app/apple-icon.png`; generated from the existing "AD" monogram by `node scripts/generate-pwa-icons.mjs` (no new logo was invented) |
| Service worker (`/sw.js`) | `src/pwa/sw.js` (hand-written, ~200 lines) + `src/pwa/policy.js` (pure cache rules, unit-tested), assembled at request time by `src/app/sw.js/route.ts`. No build plugin: Serwist/Workbox were not used because they need webpack/plugin hooks and hide the rules; here every rule is readable in one file |
| Page side | `src/lib/pwa/{register,store,install}.ts`, `src/features/pwa/pwa-runtime.tsx` (mounted once in the locale layout) |
| Offline notice | `public/offline.{html,css,js}` — static, bilingual fr/ht, `noindex` |
| Messages | `src/i18n/messages/{fr,ht}/pwa.ts` (Creole strings are unreviewed by a native speaker) |

## What the worker does, per class of request (`classify` in `policy.js`)
| Class | Examples | Strategy | Stored? |
|---|---|---|---|
| static | `/_next/static/**` (content-hashed) | cache-first | yes (`static`) |
| shell | `/offline.html`, `.css`, `.js` | cache-first, precached at install (install fails without them) | yes (`shell`) |
| page | `/`, `/fr`, `/fr/products`, `/fr/products/<slug>`, `/fr/cart`, `/fr/search`, `/fr/info/<slug>` (an allow-list) | network-first, 4 s timeout when a copy exists; a copy is used when the network fails and the page says "Données enregistrées" | yes (`pages`, max 40) |
| api | public catalog reads only: `/api/v1/{products,products/search,products/<id>,categories,categories/<id>,store/pickup}` | network-first (4 s); copy used only when the network fails and only if ≤ 24 h old | yes (`api`, max 60) |
| image | product images from the configured asset host, `/_next/image`, `/icons` | stale-while-revalidate | yes (`images`, max 40) |
| private-page | every other navigation: `/admin`, `/account`, `/auth`, `/reserve`, `/reservations` and any unknown page | network only; offline → the offline notice (HTTP 503), **never a saved copy** | never |
| bypass | anything with `Authorization`, every non-GET, range requests, `/api/**` of the web app, RSC/prefetch requests, `/sw.js`, Supabase and any other origin, `/api/v1/admin/**`, `/me/**`, `/reservations/**` | not intercepted at all | never |

Safe by default: a page is cacheable only if its path is on the allow-list; new routes are private until added on purpose.
Pages are saved from the shared, pre-rendered shell (it contains no personal data: the signed-in user's data is fetched client-side with the token, which the worker never sees as cacheable).

## Cache hygiene
- Caches are named `ana-<PWA_VERSION>-<kind>` (`PWA_VERSION` = one value per build from `next.config.ts`, or pin it with the `PWA_VERSION` env var). On activation every `ana-*` cache of another version is deleted.
- Update flow: the new worker installs and **waits** (no silent swap under an open tab); the page shows "Nouvelle version disponible — Actualiser"; "Actualiser" sends `SKIP_WAITING`, the worker claims the tab and the page reloads once. The cart (`localStorage`) is kept. The page also checks for a new worker when the tab becomes visible and hourly.
- Session end (signed in → signed out: the sign-out button, an expired session, or signing out in another tab) deletes the `pages` and `api` caches, from the page and by message to the worker. Nothing private is stored by design; this is defence in depth. The hashed assets, images and offline notice are kept (nothing private in them).
- Never stored, by construction and by test (`src/pwa/policy.test.ts`, `e2e/pwa`): staff pages or data, account, auth callbacks/tokens, reservation creation or tracking (reference + phone), Supabase traffic, any request with `Authorization`, non-GET requests.

## Offline behaviour the customer sees
- A strip: "Vous êtes hors connexion — les prix et la disponibilité affichés peuvent ne pas être à jour" (or "Données enregistrées" when the shop itself did not answer and a saved copy is shown).
- The cart (stored on the device) opens as an **estimate**: "ce panier est une estimation… prix et disponibilité n'ont pas été actualisés ; ils seront vérifiés à l'envoi". The server re-prices every line at reservation time, as always.
- Reserving, tracking a reservation, signing in, the account and the administration are **not available offline**: the buttons are disabled with a reason, and navigating there shows the offline notice. Nothing is queued: the customer must reconnect and send it.
- Back online: the strip disappears and pages refetch on navigation.

## Install guidance
`beforeinstallprompt` card on Android/desktop, "Add to Home Screen" hint on iPhone Safari (other iOS browsers cannot install). Never on the first visit, never while reserving/tracking/signing in/administrating, never when already installed, and after "Pas maintenant" not again for 60 days (`localStorage`).

## Security notes
- CSP allows `worker-src 'self'` and `manifest-src 'self'` (see `src/lib/security`). `/sw.js` is served `no-cache` with `Service-Worker-Allowed: /` and contains only the version and public origins.
- Service workers need a secure context: HTTPS in production (localhost/127.0.0.1 count as secure for testing). The worker is registered in production builds only (`next dev` is unaffected).

## Verification
`npm test` (pure rules) and `npm run e2e:pwa` (production build, real Chromium, see `e2e/pwa/run.mjs`): manifest + icons, installability via CDP, registration, offline home/product/cart, offline notice for private pages, Cache Storage enumeration while signed in as staff, sign-out purge (including from another tab), install card gating, iPhone UA hint, Creole at 390 px, and — with `PWA_REBUILD_CMD`/`PWA_EXPECT_NEXT` — the v1 → v2 update.
Not verified: installation on a physical phone, real Safari/iOS behaviour (hint only checked with an iPhone user agent), Firefox, a real flaky mobile network (Chromium offline emulation only), HTTPS deployment.

## Decisions for the owner
- Whether the shop should be browsable offline at all after sign-out (today sign-out clears saved pages and catalog answers).
- Offline catalog freshness window (24 h is a proposal).
- Native Creole review of the `pwa.*` strings.
