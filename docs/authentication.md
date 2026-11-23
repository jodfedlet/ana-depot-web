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
The only sign-in / sign-up / recovery UI is the **Supabase UI Library block** `password-based-auth-nextjs` (registry `https://supabase.com/ui/r/password-based-auth-nextjs.json`; docs `https://supabase.com/ui/docs/nextjs/password-based-auth`) plus the `social-auth-nextjs` block,
**copied as source** into `src/components/auth-block/` (this is how that library is meant to be used; it is not a hosted portal and not `@supabase/auth-ui-react`, which is
deprecated and must not be added). There are **no custom auth forms** any more and nothing sends people to a hosted login page or the Supabase dashboard.

| Route (under `/fr` and `/ht`) | Block component | Notes |
|---|---|---|
| `/auth/login` | `LoginForm` | `?next=` (checked by the official `safe-next-path` item), `?status=expired|signed_out`, resend when the address is not verified; the "Continue as guest" link is rendered by the page OUTSIDE the form |
| `/auth/sign-up`, `/auth/sign-up-success` | `SignUpForm`, sign-up-success page | the success screen is identical for new and already-registered addresses; resend uses the address kept in `sessionStorage` (never in a URL) |
| `/auth/forgot-password` | `ForgotPasswordForm` | neutral confirmation for known and unknown addresses |
| `/auth/update-password` | `UpdatePasswordForm` | needs the recovery session created by the e-mailed link; without one Supabase answers "session missing", shown as "link invalid or expired" |
| `/auth/error` | (block "error" page) | failed e-mail link; shows no inputs and never says why |
| `/auth/callback` | the block's `confirm` route + the social block's `oauth` route, merged under `[locale]` | exchanges `code` (PKCE, OAuth) **or** `token_hash`+`type` (e-mail links) for the cookie session; relative redirects; failures and OAuth cancellation go to `/auth/error` |
| `LogoutButton` | block `LogoutButton` | bound to the shared session store; used by the account menu |
| (login and sign-up pages, only when enabled) | `social-auth-nextjs` `LoginForm` as `SocialLoginForm` | Google, hidden unless `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google` (see OAuth status) |

How the block was adapted (and why it was not installed with the registry CLI as-is): the CLI would also write the block's `middleware.ts` (Next 16 refuses it next to our `proxy.ts`, and it redirects every public page to the login, which is unusable for a storefront),
a second set of Supabase clients (`client.ts`/`server.ts`/`middleware.ts`; the app already has the same `@supabase/ssr` clients in `lib/auth/supabase-browser.ts`, `supabase-server.ts` and `proxy.ts`) and `app/auth/*` pages outside `[locale]`.
So the block's forms, pages, logout button and confirm route were copied as source and adapted; there is **one** Supabase client and one cookie session.

**The block's UI primitives are the registry's own shadcn components.** `button`, `card`, `input` and `label` are the registry dependencies of `password-based-auth-nextjs`; they are copied verbatim from
`https://ui.shadcn.com/r/styles/new-york-v4/<name>.json` into `src/components/auth-block/ui/` (each file names its source). They bring `radix-ui`, `class-variance-authority`, `clsx` and `tailwind-merge`, and `src/lib/utils.ts` (shadcn's `cn`).
Branding is done in two places only: (1) `src/app/globals.css` aliases shadcn's semantic colour names to Ana's tokens (`primary` = deep teal `brand-700`, `background` = warm canvas, `accent` = terracotta tint used for hover, `destructive` = danger, `ring` = `brand-600`), so there is no second theme;
(2) a few documented edits in the copied files (44px control heights, `rounded-control`/`rounded-card`/`shadow-card` tokens, `CardTitle` is the page `<h1>` in the display font). `src/components/auth-block/auth-block.test.ts` guards that these files exist with their provenance and that no hand-written look-alike returns.
Do not re-run `npx shadcn add` for these four (it rewrites `globals.css`); update them by re-copying from the registry and re-applying the listed edits.

### Component map: official source -> this app (every deviation is listed in the file's header comment)
| App file | Official source (registry item, file) | Deviations from the registry source |
|---|---|---|
| `auth-block/login-form.tsx` | `password-based-auth-nextjs`, `components/login-form.tsx` | i18n strings; error = Supabase error CODE mapped to a fr/ht message; shared browser client; locale-aware `Link`/router; `/account` instead of `/protected`. **Gaps filled:** `?status=` banners (signed out / session expired), "resend" for an unverified address (`supabase.auth.resend`) |
| `auth-block/sign-up-form.tsx` | same, `components/sign-up-form.tsx` | i18n; `emailRedirectTo` through the locale callback; `options.data.locale` (e-mail language); **project privacy rule:** `user_already_exists` ends on the same success screen as a new address; the address is kept in `sessionStorage` for resend |
| `auth-block/forgot-password-form.tsx` | same, `components/forgot-password-form.tsx` | i18n; `redirectTo` through the locale callback |
| `auth-block/update-password-form.tsx` | same, `components/update-password-form.tsx` | i18n; `/account`; "session missing" shown as "link invalid or expired" |
| `auth-block/sign-up-success.tsx` | same, `app/auth/sign-up-success/page.tsx` | translated; **gap filled:** resend (`supabase.auth.resend({ type: "signup" })`) |
| `(store)/auth/error/page.tsx` | same, `app/auth/error/page.tsx` | never prints the raw error (no "why"); two next-step links |
| `auth-block/logout-button.tsx` | same, `components/logout-button.tsx` | goes through the app's session store (`supabase.auth.signOut` on the shared client + client state), then the localized login page |
| `auth-block/social-login-form.tsx` | `social-auth-nextjs`, `components/login-form.tsx` | `provider: "google"` (the field the docs say to change), i18n, redirect through the locale callback; not rendered unless enabled |
| `[locale]/auth/callback/route.ts` | `password-based-auth-nextjs` `app/auth/confirm/route.ts` + `social-auth-nextjs` `app/auth/oauth/route.ts` | one route under `[locale]`; `code` or `token_hash`; relative redirect |
| `lib/safe-next-path.ts` | `safe-next-path` | **verbatim** |
| `auth-block/ui/{button,card,input,label}.tsx` | shadcn registry dependencies of the block | branding edits only (see below) |
| `lib/auth/supabase-browser.ts`, `supabase-server.ts`, `proxy.ts` | `supabase-client-nextjs` and the block's `middleware.ts` | the app's own `@supabase/ssr` clients (same library); the block's files were **not** copied |

**There is no authentication abstraction layer.** The forms call `supabase.auth.signInWithPassword`, `signUp`, `resend`, `resetPasswordForEmail`, `updateUser` and `signInWithOAuth` directly, as the registry source does. The only application code around them
is `lib/auth/errors.ts` (maps a Supabase error `code` to a dictionary key: the localization of error text, nothing else), the session store (`lib/auth/auth-store.ts`, `use-session.ts`: client-side mirror of the Supabase session) and the server gate. There is no custom validation: the block's own
"passwords do not match" check, native browser validation (`required`, `type=email`) and Supabase's `weak_password` answer replace it (the earlier `lib/api/auth.ts`, hand-written `safe-next.ts`, field error component, `PasswordField` and password-strength helper were deleted).

### Gaps in the official library, and localization
- The Supabase UI library has **no localization mechanism and no theme properties**: the copied components contain English literals and Tailwind classes. Language is applied by replacing the literals with calls to the app's own dictionaries (`auth.*`, one system, fr + ht); branding by the token aliases in `globals.css` and the edits listed above. Nothing was rebuilt.
- **Limitations that remain:** the browser's native validation bubbles ("fill in this field", "include an @") are shown in the browser's language, not the page language; Haitian Creole copy still needs native review; Supabase's own English error text is never displayed (errors are mapped by code, unknown ones show a generic message).
- **E-mail language** is configurable and done through Supabase's documented templates: the sign-up form sends `options.data.locale`, and the templates in `../ana-depot-api/dev/supabase/templates/` branch on `{{ .Data.locale }}` (fr / ht). The password-reset e-mail is sent by `resetPasswordForEmail`, which cannot carry user data, so recovery e-mails use the user's stored sign-up locale.
- Gaps with no official screen, filled with the documented Supabase call and the smallest UI: resend confirmation (login and success page), signed-out / session-expired notices.

### OAuth status: Google (official `social-auth-nextjs` block)
**State of the code: complete and verified up to Google.** `SocialLoginForm` renders on `/auth/login` and `/auth/sign-up` only when `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google` was set when the app was **built** (it is empty by default, on purpose: with the provider not configured in Supabase the button would lead to a Supabase error page). It calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })` through the app's `@supabase/ssr` browser client, which uses the PKCE flow (`flowType: "pkce"`); the verifier is kept in an `sb-<ref>-auth-token-code-verifier` cookie (`SameSite=Lax`, `Path=/`, `Secure` over HTTPS). `redirectTo` is `<origin>/<locale>/auth/callback?next=<path>`, with `next` checked by the official `safe-next-path`. The callback route (`app/[locale]/auth/callback/route.ts`) calls `exchangeCodeForSession(code)`, writes the session cookies and redirects (relative `Location`) to `next` or `/account`. A cancelled or failed round trip (`?error=…`) or a rejected code ends on `/auth/error?reason=oauth` (fr/ht wording about Google, not about e-mail links). The Spring API needs no change: it validates the Supabase JWT and attaches the customer profile by `sub`, whatever the provider.

**Order of events (do not mix the two callbacks):** browser -> Supabase `/auth/v1/authorize` -> **Google** -> **Supabase** `https://<project-ref>.supabase.co/auth/v1/callback` (this is the URI Google must allow) -> **Ana Dépôt** `https://<origin>/<locale>/auth/callback?code=…` (this is the URL Supabase must allow).

**What has to be done by hand to turn it on for a Supabase project (nothing of this has been done: no hosted project, Google client or Cloudflare access was available to the person who wrote this):**
1. *Google Cloud console > Google Auth Platform* (consent screen first: app name, support e-mail, scopes `openid`, `email`, `profile`; in "Testing" mode add the test accounts) > Clients > **Create client** > type **Web application**. Authorized JavaScript origins: `https://dev.anadepot.com` (later the production origin; `http://127.0.0.1:3100` only for local work). Authorized redirect URIs: **exactly** the "Callback URL (for OAuth)" shown in Supabase under the Google provider, `https://<project-ref>.supabase.co/auth/v1/callback`, and nothing else. Copy the Client ID and Client secret.
2. *Supabase dashboard (the development project) > Authentication > Sign In / Providers > Google*: enable, paste Client ID and Client secret (the secret lives only here, never in Git, a chat, a Cloudflare variable or any `NEXT_PUBLIC_*`), save. Leave "Skip nonce checks" off.
3. *Supabase dashboard > Authentication > URL Configuration*: **Site URL** `https://dev.anadepot.com`; **Redirect URLs**: `https://dev.anadepot.com/fr/auth/callback` and `https://dev.anadepot.com/ht/auth/callback` (the query string `?next=` is not part of the match; no wildcard is needed). Add `http://127.0.0.1:3100/fr/auth/callback` and `/ht/auth/callback` only if you test locally against that project.
4. *Cloudflare dashboard > Workers & Pages > `ana-depot-web-dev` > Settings > Build > Variables and secrets*: add build variable **`NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS` = `google`** (type *Text*, not a secret). It is inlined at build time: **retry/trigger a build** (a push, or "Retry build"); changing it without a rebuild does nothing. Keep it unset on the production Worker until production has its own Google/Supabase configuration.
5. Local work: put the same line in `.env.local` and restart; Supabase CLI projects need `[auth.external.google]` (`enabled = true`, `client_id`, `secret = "env(...)"`) in `config.toml`.

**Real test to run after step 4 (the part that could not be run here):** open `https://dev.anadepot.com/fr/auth/login` and `/ht/auth/login` (Google card visible) -> "Continuer avec Google" / "Kontinye ak Google" -> Google consent -> back on the site, signed in at `?next=` or `/account` -> in Supabase > Authentication > Users the user shows provider `google` -> `GET /api/v1/me` with that session returns the same `userId` as the Supabase user id and the customer profile after the first save -> cancel at the consent screen: `/auth/error?reason=oauth` -> sign in again with an existing e-mail/password account that has the same verified address: Supabase links the identities to one user (check Authentication > Providers > "Allow manual linking"/automatic linking behavior for the project before launch). **Account linking is a product/security setting of the Supabase project, not of this code.**

**Verified locally with the real Supabase stack (`npm run e2e:oauth`, 27 checks; not Google):** button in fr and ht next to the unchanged e-mail form; click stores the PKCE verifier cookie and navigates to `/auth/v1/authorize?provider=google` with an S256 challenge and the exact locale callback; open-redirect `next` replaced; a REAL PKCE `?code=` issued by GoTrue (via magic link, the same callback shape) is exchanged, session cookies written, `next` honoured, `//evil.example` refused, reuse of the code refused; cancelled, failed, invalid and verifier-less callbacks end on the Google error page in fr and ht without a session. Observation: after an exchange the main verifier cookie is removed, but supabase-js leaves its own per-flow bookkeeping cookies (`…-auth-token-flow-<hash>-code-verifier`, `…-flows-code-verifier`); they are library internals.

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

### Checklist for a HOSTED project (nothing of this was performed: no hosted project exists yet; the local project already satisfies it)
Authentication > Sign In / Providers: Email enabled, **Confirm email ON**, minimum password length set (the local project uses 8); other providers off unless configured.
Authentication > URL Configuration: **Site URL** = the deployed origin; **Redirect URLs** = `https://<origin>/fr/auth/callback`, `https://<origin>/ht/auth/callback` (plus the `workers.dev` origin of a development Worker). Authentication > Emails: the confirmation and recovery templates of `../ana-depot-api/dev/supabase/templates/` (token-hash links, fr/ht).
Separate hosted projects for development and production, each with its own URL, publishable key and redirect list; the web build variables (`NEXT_PUBLIC_SUPABASE_*`) select the project. SMTP: the built-in sender is not for production. Never put the service-role key in the web app.

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
- Open-redirect protection on `?next=` (the official `safe-next-path` item) and in the callback route. The callback redirects with a **relative** `Location`: `request.nextUrl.origin` is the
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
- **Mocked / unit** (`npm test`): `src/lib/auth/auth.test.ts` (mocked Supabase client: config validation, error mapping, the official safe-next-path, store transitions) and
  `src/components/auth-block/auth-block.test.ts` (static guards: old forms/routes gone, no auth inputs outside the block, one Supabase client, every auth page behind the unavailable gate,
  guest link outside the form, fr/ht auth key parity and no untranslated string).
- **Stub-based browser** (`npm run e2e:stub`, `e2e/stub-supabase/`): the built app against a tiny FAKE Supabase REST API. Used for states the real stack cannot produce on demand (HTTP 429, network failure) and fr/ht message checks. Not real Supabase.
- **Unavailable-state browser** (`npm run e2e:unavailable`, `e2e/unavailable/`): run against a build with missing or malformed config; asserts no inputs/forms on any auth route or `/admin`, and no Auth request.
- **REAL local-stack OAuth/PKCE flows, no API needed** (`npm run e2e:oauth`, `e2e/real-supabase/oauth-flows.mjs`; needs a build with `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google`): see "OAuth status" above. Google itself is not exercised.
- **REAL local-stack auth flows, no API needed** (`npm run e2e:auth-flows`; `EXPECT_OAUTH=1` when the build lists Google, `e2e/real-supabase/auth-flows.mjs`; needs the local Supabase stack, Mailpit and `node e2e/real-supabase/stub-api.mjs`): sign-up checks, verification e-mail in fr and ht, resend, unverified sign-in, verification link, session cookie, sign-out, protected page, `?next=`, used links rejected, recovery and reset, session refresh and unrefreshable session, duplicate registration, public pages, OAuth failure redirect. The `/api/v1/me*` calls hit a stub, so the backend is **not** exercised.
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
