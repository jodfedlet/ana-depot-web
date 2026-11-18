# Authentication & authorization (ana-depot-web)

Ana Dépôt uses **Supabase Auth** as its identity provider. The old demonstration sign-in (any password created a local
session, `admin@…` meant "staff", `wrong-password` showed an error) has been **removed**. What is real and what is not:

| | Status |
|---|---|
| Customer sign-up, e-mail verification, sign-in, sign-out, password recovery/reset, session persistence/refresh | **Real** (Supabase Auth through `@supabase/supabase-js` + `@supabase/ssr`; UI = the Supabase UI "password-based auth" block, see below) |
| Protected customer account pages (`/account/**`) | **Real** (server-side session check) |
| Staff sign-in and admin protection (`/admin/**`) | **Real** (Supabase session **and** backend `staff: true`, checked on the server) |
| Backend JWT validation, `GET /api/v1/me`, staff provisioning | Implemented in `../ana-depot-api` — see `../ana-depot-api/docs/auth.md` |
| Admin **data** (products, stock, reservations, payments, customers, reports, pickup settings) | **Real**: `/api/v1/admin/**` (see `admin-integration.md`) |
| Linking account ↔ reservations | **Real**: reservations made while signed in are linked by the API to the account; `/account` reads `/me/profile` and `/me/reservations` (see `storefront-integration.md`) |

## The auth UI: Supabase UI "password-based-auth-nextjs" block
The only sign-in / sign-up / recovery UI is the **Supabase UI Library block** `password-based-auth-nextjs` (registry `https://supabase.com/library/r/password-based-auth-nextjs.json`),
**copied as source** into `src/components/auth-block/` (this is how that library is meant to be used; it is not a hosted portal and not `@supabase/auth-ui-react`, which is
deprecated and must not be added). There are **no custom auth forms** any more and nothing sends people to a hosted login page or the Supabase dashboard.

| Route (under `/fr` and `/ht`) | Block component | Notes |
|---|---|---|
| `/auth/login` | `LoginForm` | `?next=` (same-site, `safeNextPath`), `?status=expired|signed_out`, resend when the address is not verified; the "Continue as guest" link is rendered by the page OUTSIDE the form |
| `/auth/sign-up`, `/auth/sign-up-success` | `SignUpForm`, sign-up-success page | the success screen is identical for new and already-registered addresses; resend uses the address kept in `sessionStorage` (never in a URL) |
| `/auth/forgot-password` | `ForgotPasswordForm` | neutral confirmation for known and unknown addresses |
| `/auth/update-password` | `UpdatePasswordForm` | needs the recovery session created by the e-mailed link; otherwise "request a new link" |
| `/auth/error` | (block "error" page) | failed e-mail link; shows no inputs and never says why |
| `/auth/callback` | the block's `confirm` route, adapted | exchanges `code` (PKCE) **or** `token_hash`+`type` for the cookie session; relative redirects; failures go to `/auth/error` |
| `LogoutButton` | block `LogoutButton` | bound to the shared session store; used by the account menu |

How the block was adapted (and why it was not installed as-is): its `client.ts`/`server.ts`/`middleware.ts` are **not** copied because the app already has the same `@supabase/ssr`
clients (`lib/auth/supabase-browser.ts`, `supabase-server.ts`) and `proxy.ts`, and the block middleware redirects every public page to the login (unusable for a storefront); there is **one**
Supabase client and one cookie session. Its shadcn `Card/Input/Label/Button` are re-implemented in `components/auth-block/primitives.tsx` with our design tokens (no new UI dependencies: shadcn would add
radix, class-variance-authority, clsx, tailwind-merge and a second theme). Strings come from the typed `auth.*` dictionaries (fr/ht), errors are mapped from Supabase error **codes**
(`lib/auth/errors.ts`) and Supabase's English text is never displayed. Old URLs (`/sign-in`, `/register`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/admin/sign-in`)
only exist as redirects in `next.config.ts`. Guests never need an account.

**Missing or invalid configuration** (`lib/auth/config.ts`: URL missing/malformed/non-HTTPS outside localhost, key missing/malformed, key that looks like a secret) makes every auth route render the
localized "authentication unavailable" state (`auth-unavailable.tsx`): no inputs, no demo session, no staff access, and the cause is logged once on the server as problem codes only (never values).
A secret/service-role key in `NEXT_PUBLIC_*` additionally **fails the build** (`next.config.ts`), because `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time.

**Haitian Creole:** every auth string has a Creole translation, but they are drafts that need native review before launch; do not describe the auth UI as fully reviewed Creole.

## Concepts (keep them apart)
1. **Supabase user identity** — who signed in (`auth.users`). Created by sign-up; e-mail verified by Supabase.
2. **Ana Dépôt customer profile** — optional business record linked to that identity (`customerProfileId` in `/me`), owned by the backend.
3. **Staff membership** — a backend record (`staff_members`) created by a trusted administrative process, **never** by registration and never from `user_metadata`.
4. **Store permissions** — what a staff member may do. The role model/permission matrix is an **open business decision**; the frontend only asks
   `canAccessAdmin(me)` (`src/lib/auth/authorization.ts`) and carries `permissions` opaquely for later.

Registering an account never makes anyone staff. An authenticated customer opening `/admin` gets "access denied".

## Configuration
Copy `.env.example` to `.env.local`:

| Variable | Where | Meaning |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL (`https://<ref>.supabase.co`, or `http://127.0.0.1:54321` for the local CLI) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **or** `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | The project's **public** key. Use whichever name your project uses; the publishable one wins if both are set |
| `NEXT_PUBLIC_API_BASE_URL` | browser + server | Public base URL of the Spring Boot API (the typed client in `src/lib/api/client.ts` calls it from the browser) |
| `API_BASE_URL` | server only (optional) | Server-side override (e.g. an internal address). Server Components call `GET /api/v1/me` with the user's bearer token at `API_BASE_URL`, falling back to `NEXT_PUBLIC_API_BASE_URL` |

**`NEXT_PUBLIC_*` variables are inlined at BUILD time**: changing them requires a rebuild (`npm run build`), not just a restart.

Which calls are made from where: **browser -> Supabase Auth** (sign-in/up, recovery, refresh) and, once screens are connected, **browser -> API** through `browserApiClient()`
(bearer token read from the current Supabase session on every call; never logged). **Server (Next) -> API**: only `GET /api/v1/me` for the admin gate and the account gate.
`NEXT_PUBLIC_*` values are inlined at **build** time: change them and rebuild.

The **service-role key is not used by this app** and must never be added to the web project or exposed to the browser. Never commit real values
(`.env*` is git-ignored; only `.env.example` with placeholders is tracked). If the two Supabase variables are missing, every auth screen
says "not configured" and `/admin` is denied — nothing pretends to work.

### Supabase project settings (dashboard → Authentication)
- **Email provider** enabled with **Confirm email** ON (the UI assumes verification is required; if it is off, sign-up signs the user in directly and the UI handles that).
- **E-mail templates** (Authentication -> Emails): use the **server-side token_hash links**, not the default links. Confirm signup:
  `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup">...</a>`; Reset password: same with `type=recovery`. `{{ .RedirectTo }}` is the
  `/{locale}/auth/callback?next=...` URL this app sends. Reference templates (fr/ht, selected by `{{ .Data.locale }}`) are in `../ana-depot-api/dev/supabase/templates/`.
  **Why:** the default confirmation link of a *resent* verification e-mail uses the implicit flow (tokens in the URL fragment, which a server route cannot read) so the person
  sees "invalid link" although the address was verified; token_hash links work for sign-up, resend and recovery, and in any browser/device (no PKCE verifier cookie needed).
- **Site URL** = the deployed origin; **Redirect URLs** must include `https://<origin>/fr/auth/callback`, `https://<origin>/ht/auth/callback` (and `http://localhost:3000/...` for dev).
- Auth e-mails use PKCE links that return to `/{locale}/auth/callback?code=…&next=…`. Open the link in the **same browser** that requested it
  (the PKCE verifier is stored in a cookie); otherwise the screen says the link is invalid/expired and offers a resend.
- Consider password strength policy and CAPTCHA in the dashboard; the app maps `weak_password`, `over_*_rate_limit`, `invalid_credentials`,
  `email_not_confirmed`, `user_already_exists` to translated messages.

### Local development with the Supabase CLI
A ready local stack (real GoTrue, ES256 signing keys, Mailpit, templates above) lives in `../ana-depot-api/dev/supabase`; start/stop/reset and findings are in
`../ana-depot-api/docs/local-supabase.md`. Put its API URL and publishable key in `.env.local` together with `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080`.

## How sessions work
- `@supabase/ssr` stores the session in **cookies** (chunked), not in `localStorage`; no password is ever stored by this app.
- `src/proxy.ts` keeps the locale redirect **and** refreshes the session for visitors that have an auth cookie (`getClaims()` verifies the token and rotates it
  when needed). It is **not** an authorization layer.
- Server Components use `createServerSupabase()` + `getUser()` (token verified by Supabase) — never the unverified cookie contents.
- The browser mirror (`src/lib/auth/auth-store.ts`, `useSession()`) starts as `loading` and becomes `signed_in` only after `getUser()` succeeds; it follows
  `onAuthStateChange` (sign-out in another tab, revoked/expired session ⇒ `signed_out`; the admin shell then returns to `/auth/login?status=expired&next=/admin`).

## Admin protection (server-side, deny by default)
`app/[locale]/admin/(app)/layout.tsx` → `AdminGate` (`features/admin/admin-gate.tsx`) runs **before any admin UI renders** (inside `<Suspense>` because it reads cookies):

| Situation | Result |
|---|---|
| Auth not configured | "Connection not configured" page (no sign-in button: there is nothing to sign in to) |
| No session | redirect to `/auth/login?next=/admin` |
| Invalid/expired session, or backend answers 401, or `/me` describes another user | redirect to `/auth/login?status=expired&next=/admin` |
| Signed in, `staff: false` | "Access denied" page (no admin markup or data) |
| Backend unreachable / malformed answer | "Cannot verify your permissions": **denied** |
| Signed in, `staff: true` | admin shell renders |

Caveat: layouts do not re-run on client-side navigations. The real protection for data is the backend, which
authorizes every `/api/v1/admin/**` request from the bearer token; the gate decides what the first render shows. Hiding links is never the mechanism.

## Provisioning the first administrator
There is **no** UI or public endpoint for it, by design, and no hard-coded credentials. The process (details in `../ana-depot-api/docs/auth.md`): the owner
creates (or invites) the user in Supabase Auth, then a trusted operator inserts that user's Supabase `sub` into the backend's `staff_members` table using the documented
one-off administrative procedure (`ANA_BOOTSTRAP_ADMIN_SUBJECT`). Until that row exists the user is just a customer.

## Team and second factor (after the first administrator)
- **Further team members join with a one-time code**, not by editing the database: *Administration > Équipe* creates a code (shown once; the API stores only its hash), the colleague signs in with their own account and opens `/{locale}/account/join-team` (the link carries the code in the URL *fragment*, which browsers never send to a server; the page removes it from the address bar when it is used). A wrong, used, revoked or expired code gives one and the same message. Members can be removed and restored; nobody changes their own access; the last active member cannot be removed. All members have the same rights (roles: decision D14).
- **Second factor.** When the API runs with `ANA_STAFF_REQUIRE_MFA=true`, `/me` answers `staff:false, mfaRequired:true` for a team member whose session has not passed a TOTP code, and the gate (`resolveAdminAccess` state `mfa_required`) renders ONLY `features/admin/staff-mfa.tsx`: enrol (QR + key) or verify, using Supabase Auth MFA with the public key. After success the page reloads and the server asks the API again; the API trusts only the signed `aal2` claim. Verified locally by `npm run e2e:team`; the hosted Supabase project must have TOTP enabled.

## Customer UX covered (French + Haitian Creole)
Sign-in, registration, verification pending/success/failure with resend, password recovery and reset (incl. expired link), expired session, invalid credentials,
weak password, rate limiting, network errors, "not configured", sign-out confirmation, unauthorized admin access.
Guests are never asked to register: browsing, cart, guest reservation and tracking (reference + phone) are untouched.

## Security decisions
- No custom password/session code; Supabase owns credentials and refresh-token rotation.
- Signed-in state is shown only after Supabase confirms; failures are returned as codes and translated, never as simulated success.
- Open-redirect protection on `?next=` (`safeNextPath`) and in the callback route. The callback redirects with a **relative** `Location`: `request.nextUrl.origin` is the
  server's own hostname (`localhost` under `next start`), and redirecting to another host than the browser used drops the session cookie (found against the real stack).
- `user_metadata` (first name) is used for **display only**; it is user-editable and never used for authorization.
- **Account enumeration (privacy).** Our screens never say whether an address has an account: sign-up shows the same "if this address can be used, a message was sent" screen for new and
  existing addresses (`user_already_exists`/`email_exists`/no-identities are all treated as success); sign-in answers wrong password and unknown address with the same message;
  recovery and resend always show the same neutral confirmation. **What remains observable, measured on GoTrue v2.184 (confirmations on):** the provider API itself, called directly with the
  public key, answers `POST /auth/v1/signup` for a **confirmed** account with `422 user_already_exists` (not obfuscated), and sign-in/recovery responses differ in timing (known account
  ~330 ms/~100 ms vs unknown ~40 ms/~30 ms). Hiding it in the UI does not close that; closing it needs sign-up to go through a server we control (disable public sign-up in Supabase and
  create users from the backend after rate limiting/CAPTCHA) - a product decision, not implemented.
- Sign-out uses `scope: "local"` (this browser). A "sign out everywhere" action is a possible later addition.
- Staff access is deny-by-default and fails closed when the backend cannot be reached.

## Tests (labelled by what they prove)
- **Mocked / unit** (`npm test`): `src/lib/auth/auth.test.ts` (mocked Supabase client: config validation, error mapping, request shapes, store transitions, uniform sign-up) and
  `src/components/auth-block/auth-block.test.ts` (static guards: old forms/routes gone, no auth inputs outside the block, one Supabase client, every auth page behind the unavailable gate,
  guest link outside the form, fr/ht auth key parity and no untranslated string).
- **Stub-based browser** (`npm run e2e:stub`, `e2e/stub-supabase/`): the built app against a tiny FAKE Supabase REST API. Used for states the real stack cannot produce on demand (HTTP 429, network failure) and fr/ht message checks. Not real Supabase.
- **Unavailable-state browser** (`npm run e2e:unavailable`, `e2e/unavailable/`): run against a build with missing or malformed config; asserts no inputs/forms on any auth route or `/admin`, and no Auth request.
- **REAL local Supabase + real API browser** (`npm run e2e:real`): described next.
- **REAL local-stack suite** (`npm run e2e:real`, `e2e/real-supabase/run.mjs`): drives the built app against a LOCAL Supabase stack (real GoTrue + Mailpit) and the real Spring Boot API: registration, verification
  link read from the mail catcher, unverified sign-in rejection, resend, sign-in, persistence across reload, cookie session (no token in localStorage), revoked session, sign-out, wrong password, forgot/reset
  (old password rejected, used link rejected, link opened in a different browser), session refresh from an expired access token, already-registered privacy, admin gating with a real customer vs a real staff member vs anonymous, old-form fields absent on every auth route, requests targeting the configured Supabase URL, legacy URL redirects, guest pages. Requires the env listed in the file header.
  It is **not** a hosted-Supabase test.
- Unit tests use a **mocked** Supabase client and mocked `fetch` (`src/lib/auth/auth.test.ts`, `src/lib/api/http.test.ts`): they prove our logic (error mapping, access
  decisions, request shapes, store transitions). They **do not** prove a real Supabase project accepts the calls.
- The stub (`e2e/stub-supabase/stub.mjs`) is test-only code and never part of the app. **It is a mock**; the real-stack suite above is what proves behavior against real GoTrue.

## Security headers, CSP, cookies
The web app sends a Content-Security-Policy and the other security headers on every response (`src/lib/security`), marks the auth cookies `Secure` over HTTPS (`src/lib/auth/cookie-options.ts`, `SECURITY_HTTPS_ONLY`) and ships `scripts/scan-bundle-secrets.mjs` (run it after `npm run build`).
Controls, the local verification evidence, what was NOT verified (hosted Supabase, real R2, TLS) and the hosted hardening checklist are in `../ana-depot-api/docs/security.md`.
