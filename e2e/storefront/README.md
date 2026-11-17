# Storefront browser suite (local stack)

Drives the **built** storefront in a real Chromium against the **real Spring Boot API**, a **local Supabase stack** (real GoTrue + Mailpit) and an
S3-compatible store (**MinIO** standing in for Cloudflare R2). It is **not** a test of a hosted Supabase project and **not** of real R2.
It never runs in CI by default and must never be pointed at production (it creates users, reservations, payments and stock adjustments).

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
