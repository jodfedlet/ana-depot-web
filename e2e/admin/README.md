# Administration browser suite (local stack)

Drives the **built** web app in a real Chromium as a real **staff** user against the **real Spring Boot API**, a **local Supabase stack** (GoTrue + Mailpit) and **MinIO** standing in for Cloudflare R2.
It is **not** a test of hosted Supabase or real R2. It creates categories, products, reservations, payments and stock adjustments: never point it at production.

## Prerequisites
Same stack as `e2e/storefront/README.md` (local Supabase, staff user bootstrapped in the API, API with `ANA_CORS_ALLOWED_ORIGINS`, `ANA_TERMS_VERSION`, R2 variables → MinIO with a public bucket, relaxed
`reservation.submit` / `reservation.lookup` limits, web built and started on `WEB_URL`). Seed once with `python3 e2e/storefront/seed.py` if the catalog is empty.

## Run
```bash
export SUPABASE_PUBLIC_KEY=... STAFF_EMAIL=... STAFF_PASSWORD=...
export SUPABASE_LOCAL_SECRET_KEY=...   # optional, LOCAL stack only (customer-vs-staff checks create a second user)
# clear ana_depot.rate_limit_counters between runs within 10 minutes
WEB_URL=http://127.0.0.1:3100 API_URL=http://127.0.0.1:8080 npm run e2e:admin
```
Sections: A access · B dashboard/reports · C categories · D products (real image upload, publish, storefront) · E inventory (exactly-once retry) · F full reservation/payment journey ·
G customers · H settings · I mobile 390px, Creole and demo-wording sweep. Screenshots go to `SHOTS_DIR` (git-ignored). Exit code 1 on any failed check.
