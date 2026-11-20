# Administration ↔ API integration (Phase 4)

Every administration screen reads and writes the real staff API (`/api/v1/admin/**`, contract: `../ana-depot-api/docs/api.md`). There is no demo business data and no
business record in the browser. Backend rules are never re-implemented: the UI renders what the API returns (`allowedActions`, balances, statuses) and shows success only after the server confirmed.

## Access
1. Supabase session (`@supabase/ssr` cookies) AND `GET /api/v1/me` → `staff: true`, decided on the server in `features/admin/admin-gate.tsx` (default deny; backend unreachable ⇒ denied).
2. Every admin call goes through `signedInClient()` (`lib/api/session-client.ts`): the token is read per call; no session ⇒ `ApiError(401, "session_expired")`, never an anonymous call.
3. The backend authorizes every `/api/v1/admin/**` request itself; hiding links is not a control.

## Data layer (`src/lib/api/admin/`)
| File | Role |
|---|---|
| `dto.ts` | Wire types mirroring the Spring records |
| `client.ts`, `endpoints.ts` | One typed function per staff endpoint |
| `hooks.ts`, `reservation-hooks.ts` | `useAdminResource` (abort-safe, keeps previous data while reloading), `useAction` (a single in-flight write) |
| `signals.ts` | `announceAdminChange()` refreshes sidebar counters and the notification bell |
| `upload.ts` | Image upload: ticket → direct PUT (progress) to the presigned URL → complete |
| `../idempotency.ts` | `attemptKey(scope, payload)` / `endAttempt(scope)` |

## Writes
- **Concurrency**: PUT/PATCH carry the record `version`. 409 `concurrent_update` ⇒ the screen reloads the record and says nothing was overwritten. Forms remount with `key={id:version}`.
- **Idempotency**: a retry after an uncertain outcome (timeout, network, ≥502) of the SAME payload reuses the same `Idempotency-Key`; a changed payload gets a new key; a definite answer ends the attempt.
  Payments and stock adjustments always send one.
- **Errors**: 401 ⇒ sign in again; 403 ⇒ fail closed, no data; 404; 409; 422 (field problems mark the inputs); 429; 5xx. Every known code has fr and ht text (`apiErrors.*`, `fieldErrors.*`).

## Modules
| Module | Notes |
|---|---|
| Dashboard / Reports | Server-side aggregates, HTG and USD never combined. No endpoint gives total balances due: the dashboard lists ready-for-pickup reservations awaiting payment with their own balances |
| Categories | Dynamic attributes (key `[a-z][a-z0-9_]*`, option code `[a-z0-9][a-z0-9_-]*`), variant axes, version conflicts |
| Products | Per-currency prices, wholesale tiers, variants (combinations of the category's variant axes), lifecycle (draft/active/inactive), images |
| Inventory | On hand / reserved / available, register, adjust (reason + idempotency), thresholds (seller-set only), movement history |
| Reservations | Accept / reject / ready / collect / cancel, internal vs customer-visible notes, actions from `allowedActions` |
| Payments | Per currency, only while READY_FOR_PICKUP, ledger, reversal, adjustment; a cash payment above the balance is refused by the server (D3) and the dialog shows the maximum; reversal/adjustment for Owner and Manager only; refunds are made in the Stripe dashboard: card money on a rejected/cancelled/expired reservation shows "refund due" and what Stripe reported as already refunded (D1) |
| Customers | Guests corrected in place, never merged; registered customers read-only |
| Pickup settings | Snapshots of existing reservations never change |
| Messages (`/admin/notifications`) | Customer e-mails: summary tiles, filters, plain-language failures, confirmed "Resend" for a message that gave up, a block on each reservation, a dashboard warning when messages fail or sending is off; recipients are masked by the API |
| Team (`/admin/team`) | Invite with a one-time code (shown once), remove / restore access with confirmation, pending invitations first and history on demand; a role (Owner / Manager / Staff) chosen at invitation and changed by an owner; recovery codes per member (count shown, never the codes) |
| Payments report | Received money split by method (cash / online) and currency; reservation value (sales) is a separate tab |

## Verification
`npm run e2e:notifications` covers customer e-mail end to end against a real SMTP catcher (API in `ANA_MAIL_MODE=smtp`, short retry timings; it stops and starts the catcher container for the outage test).
`npm run e2e:team` covers the team and staff second factor (needs the API with `ANA_STAFF_REQUIRE_MFA=true`); `npm run e2e:a11y` runs axe on every main screen (390/1280 px, fr+ht).
`npm run e2e:admin` (see `e2e/admin/README.md`) drives the production build in Chromium against the real API, a LOCAL Supabase stack and MinIO. It is **not** a test of hosted Supabase or Cloudflare R2.
Unit tests (`npm test`) cover the pure form logic, idempotency, upload and error mapping.

## Open decisions (not invented)
Overpayment and partial-payment policy and who may record payments · hold period/expiry · customer cancellation and refunds · staff roles/permissions · low-stock policy · notification channel ·
terms text/version (`NEXT_PUBLIC_TERMS_VERSION` must equal the API's `ANA_TERMS_VERSION`) · R2 public image domain · native Haitian Creole review of every new string.

## Roles in the administration (D14, approved) and the second factor (D15)
* `lib/admin/access.ts` maps each page to the permission the server requires (`/me.permissions`): the menu hides what the role may not open, a page opened by URL says it is not available with the role (no data, no error screen), controls the role lacks are not rendered (reverse/adjust payment, stock adjustment, customer edit, resend a message, products/reports/settings/team). The SERVER refuses the same requests (`AdminAccessMatrixIntegrationTest`).
* Counter staff (STAFF) get a dashboard without money figures (work queue + stock alerts); Owner and Manager get the full one; only the Owner sees pickup/store settings and the team.
* Second factor: the verification screen offers "I lost my authenticator" (recovery code); a session in through a code shows a banner; `/admin/security` makes a new set of codes (shown once). Verified by `e2e:roles` (48 checks) and `e2e:team` (41 checks, real GoTrue TOTP).
