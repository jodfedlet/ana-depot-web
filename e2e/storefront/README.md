# Storefront browser suite (local stack)

Drives the **built** storefront in a real Chromium against the **real Spring Boot API**, a **local Supabase stack** (real GoTrue + Mailpit) and an
S3-compatible store (**MinIO** standing in for Cloudflare R2). It is **not** a test of a hosted Supabase project and **not** of real R2.
It never runs in CI by default and must never be pointed at production (it creates users, reservations, payments and stock adjustments).

## Safety: these scripts write data, so they only run against a dedicated local test target
The seed and every browser suite that creates data call `scripts/e2e-target-guard.mjs` first and **refuse to run** unless ALL hold: `API_URL`, `SUPABASE_URL` and `WEB_URL` are set explicitly (there are no default ports any more);
`E2E_TARGET_CONFIRM` equals `API_URL` exactly (you name the service you mean); every host is loopback (a dedicated remote test box needs `E2E_ALLOW_NON_LOOPBACK=1`, and a hosted-looking name is refused regardless);
and the API's public pickup answer identifies a test store: never configured (a fresh dedicated database) or carrying the seed's own name ("Magasin de vérification (données de test)").
A developer's database, a real shop or a service that does not answer is refused before anything is written. Example:
`export API_URL=http://127.0.0.1:8086 E2E_TARGET_CONFIRM=http://127.0.0.1:8086 SUPABASE_URL=http://127.0.0.1:54321 WEB_URL=http://127.0.0.1:3106`. Unit tests: `src/lib/e2e-target-guard.test.ts`.

## Prerequisites
1. Local Supabase stack up (`../ana-depot-api/docs/local-supabase.md`), a confirmed **staff** user bootstrapped in the API (`ANA_BOOTSTRAP_ADMIN_SUBJECT`).
2. API running with:
   - `ANA_CORS_ALLOWED_ORIGINS=http://127.0.0.1:3100` (the storefront origin),
   - `ANA_TERMS_VERSION=<label>` equal to the web build's `NEXT_PUBLIC_TERMS_VERSION`,
   - R2 variables pointing at MinIO with a public bucket (so seeded product images are real objects),
   - higher rate limits for `reservation.submit` and `reservation.lookup` (the suite makes dozens of reservations/lookups from one address; the defaults are 10 and 20 per 10 minutes).
3. Web built and started with the public values (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_TERMS_VERSION`):
   `npm run build && npx next start -p 3100 -H 127.0.0.1`.
4. Seed (once): `python3 e2e/storefront/seed.py` (needs `SUPABASE_PUBLIC_KEY`, `STAFF_EMAIL`, `STAFF_PASSWORD`).

## Run
```bash
export SUPABASE_PUBLIC_KEY=... STAFF_EMAIL=... STAFF_PASSWORD=...
export SUPABASE_LOCAL_SECRET_KEY=...   # optional, LOCAL stack only: enables the cross-customer isolation checks (creates a second user)
# the real-429 section at the end exhausts the lookup budget; clear `ana_depot.rate_limit_counters` before re-running within 10 minutes
npm run e2e:storefront
```
Screenshots go to `SHOTS_DIR` (default `e2e/storefront/screenshots`, git-ignored). The suite restores its own baseline stock at the start.

## Online payment (`npm run e2e:stripe`)
`e2e/storefront/stripe.mjs` needs only a running web build (`WEB_URL`, default `http://127.0.0.1:3105`) and no credentials. Every check is **MOCKED**: the API and the Stripe-hosted page are replaced by Playwright
route handlers. It is not evidence about the real backend or about Stripe. It includes real waits (about 90 s in total) because the polling schedule is real.

`npm run e2e:stripe-real` (`stripe-real.mjs`) runs the online-payment journeys against the REAL API and a LOCAL FAKE Stripe (`../ana-depot-api/dev/fake-stripe.mjs`): guest reservation and pay-at-pickup with no card fields,
hosted page, signed webhooks (success, delayed, failed, expired, duplicate replay), the ledger, reports, HTG refusal, and the staff screens. Env: `WEB_URL`, `API_URL`, `FAKE_STRIPE_URL` (default `http://127.0.0.1:9199`), the
staff variables above; the web build needs `NEXT_PUBLIC_CHECKOUT_TEST_ORIGIN=<fake origin>` and the API's Stripe return URL must be `WEB_URL`. Scratch database only. It is NOT a test of real Stripe.
