# Cloudflare Workers deployment (Workers Builds + GitHub)

Status: **configured and verified LOCALLY only** (workerd through `wrangler dev`, a stub API, no Cloudflare account, no hosted Supabase, no real R2).
Nothing was deployed. Evidence levels: **LOCAL** (this machine), **VENDOR DOCS** (read, not exercised), **HOSTED** (none yet).
Related: the API-side plan and costs are in `../ana-depot-api/docs/staging/cloudflare-staging-plan.md`.

## 1. Decision: OpenNext adapter, not vinext

| | vinext 1.4.6 | `@opennextjs/cloudflare` 1.20.18 (chosen) |
|---|---|---|
| Cloudflare's guidance | Recommended default for new work, labelled **beta** | For existing apps that cannot move to vinext |
| `npx vinext check` on this app (LOCAL) | 95 %: 20 supported, **2 partial** (`turbopack` loader rules ignored, `cacheComponents` "behavior is incomplete") | n/a |
| This app's CSS | Tailwind runs as a **Turbopack loader rule** (`next.config.ts`); vinext ignores it, so the CSS toolchain would have to be rewritten | Unchanged: the adapter wraps a normal `next build` |
| `cacheComponents` / `"use cache"` | Documented as incomplete | Listed as supported, **but they broke this app on Workers** (section 6, item 9): the app now uses the classic caching model, which OpenNext supports |
| Extra requirements | `"type": "module"`, Vite 8, `react ^19.3.1` (the repo pins 19.3.0), a parallel Vite toolchain | Two packages and two config files |
| `src/proxy.ts` (Node proxy) | Supported | "Experimental" (build prints a warning) but works (section 5) |

vinext would change the build toolchain and depends on the feature it calls incomplete, so it is not "sufficiently compatible" without a rewrite. Revisit it when its `cacheComponents` support is complete.

## 2. What was added (and nothing else)

| File | Purpose |
|---|---|
| `wrangler.jsonc` | Worker `ana-depot-web`: `nodejs_compat`, static assets, self-reference service, private R2 cache bucket, two Durable Object classes (queue, tag cache) |
| `open-next.config.ts` | R2 incremental cache + Durable Object queue + Durable Object tag cache |
| `package.json` | scripts `cf:build`, `cf:preview`, `cf:deploy`, `cf:upload`; dependencies `@opennextjs/cloudflare`, `wrangler`; `packageManager: npm@11.6.1`; `overrides` for `cookie` (section 6) |
| `public/_headers` | `Cache-Control: immutable` for `/_next/static/*` (Workers serves static assets without running the app) |
| `.node-version` | `24` (the Workers Builds image has Node 24.22.1; Wrangler needs Node >= 22.12) |
| `.gitignore`, `eslint.config.mjs` | ignore `.open-next/`, `.wrangler/`, `.dev.vars*` |
| `src/app/api/revalidate-catalog/route.ts` | one-argument change: `revalidateTag(tag, "max")` instead of `{ expire: 0 }` (section 6) |

Existing commands (`dev`, `build`, `start`, `lint`, `test`, `typecheck`, `e2e:*`) are unchanged. `npm run build` is still a plain `next build`; `opennextjs-cloudflare build` calls it.
No application code, Supabase setup or backend was changed, and no secret is in Git.

## 3. Cloudflare Git integration settings (Workers Builds)

Create the Worker by importing the GitHub repository (Workers & Pages > Create > Import a repository). **The Worker name must be `ana-depot-web`** (it must equal `name` in `wrangler.jsonc`, otherwise the build fails).

| Setting | Value |
|---|---|
| Git repository | `jodfedlet/ana-depot-web` (its own repo; there is no monorepo) |
| **Root directory** | `/` (leave empty): `package.json` and `wrangler.jsonc` are at the repository root |
| **Production branch** | `main` |
| **Build command** | `npm run cf:build` |
| **Deploy command** | `npm run cf:deploy` |
| Builds for non-production branches | **Off** for now. A preview build would write into the production cache bucket and Durable Objects; if you need previews later, use a separate Worker/bucket |
| API token | the one Workers Builds creates (needs Workers Scripts edit and R2 edit; both are in the default token) |
| Node / npm | automatic: `.node-version` (24) and `packageManager` (`npm@11.6.1`) |

What the two commands do:
- `cf:build` = `opennextjs-cloudflare build`: runs `npm run build` (`next build`), then bundles the Worker into `.open-next/`.
- `cf:deploy` = `opennextjs-cloudflare deploy`: creates the R2 cache bucket if it does not exist, **fills it with the prerendered pages** (required, see section 6), then runs `wrangler deploy`.

Every push to `main` therefore builds and deploys. Do not run `cf:deploy` from a laptop for production unless you mean it.

### Custom domain and `workers.dev`
No domain is configured (none was supplied). After the first deployment add the domain under the Worker's Settings > Domains & Routes, then set the same origin in `NEXT_PUBLIC_SITE_URL`, in the API's `ANA_CORS_ALLOWED_ORIGINS` and in the Supabase redirect allow-list (below), and redeploy.

### Development and production Workers (two configurations)

| | Production | Development |
|---|---|---|
| Wrangler config | `wrangler.jsonc` | `wrangler.dev.jsonc` |
| Worker name (must equal the dashboard Worker) | `ana-depot-web` | `ana-depot-web-dev` |
| `WORKER_SELF_REFERENCE` service | `ana-depot-web` | `ana-depot-web-dev` |
| R2 cache bucket (private, never shared) | `ana-depot-web-cache` | `ana-depot-web-dev-cache` |
| Durable Objects / migrations | `DOQueueHandler`, `DOShardedTagCache`, migration `v1` | same names and `v1`; Durable Objects belong to their Worker, so the data is separate |
| Build command | `npm run cf:build:prod` | `npm run cf:build:dev` |
| Deploy command | `npm run cf:deploy:prod` | `npm run cf:deploy:dev` |

All four scripts pass `--config <file>` to the OpenNext CLI, which forwards it to Wrangler and to the cache-populate step. The unsuffixed `cf:build`, `cf:preview`, `cf:deploy` and `cf:upload` still use `wrangler.jsonc` (production). Each Workers Builds project (one per Worker) uses its own pair of commands, its own build variables and its own branch. Both configs write to `.open-next/`, so build and deploy with the same suffix, one after the other. A `deploy` command alone fails with "Could not find compiled Open Next config" if the matching build did not run first.

## 4. Environment variables

`NEXT_PUBLIC_*` values are inlined into the browser **and** server bundle at **build time**, and `SECURITY_*` are read by `next.config.ts` at build time. They go in **Settings > Build > Variables and secrets** (build variables are not visible to the running Worker). Changing one needs a new build.

| Name | Where | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Build | yes | project URL (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Build | yes | the PUBLIC key. The build refuses a secret/service-role key |
| `NEXT_PUBLIC_API_BASE_URL` | Build | yes | public https URL of the Spring Boot API, no trailing slash. **The API must be reachable from the build** (section 7) |
| `NEXT_PUBLIC_SITE_URL` | Build | yes | public https origin of the storefront (canonical URLs, sitemap, robots) |
| `NEXT_PUBLIC_TERMS_VERSION` | Build | yes | must equal the API's `ANA_TERMS_VERSION` |
| `NEXT_PUBLIC_TERMS_URL` | Build | no | e.g. `/info/terms` |
| `NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS` | Build | no | `google` shows the official Google sign-in block on the login and sign-up pages. Set it ONLY after Google is enabled and configured in that environment's Supabase project (docs/authentication.md, "OAuth status"); empty = no button. A text variable, never a secret (the Google client secret lives only in the Supabase dashboard). Needs a rebuild |
| `NEXT_PUBLIC_ASSET_ORIGINS` | Build | yes in production | public image origin(s) (R2/CDN custom domain); becomes the CSP `img-src`/`connect-src` |
| `SECURITY_HTTPS_ONLY` | Build | yes in production | `true`: HSTS, `upgrade-insecure-requests`, Secure auth cookies. Set only when every hostname serves valid HTTPS |
| `SECURITY_CSP_REPORT_ONLY` | Build | no | `true` = observe only |
| `PWA_VERSION` | Build | no | unset = build timestamp (new service-worker caches per build) |
| `API_BASE_URL` | **Runtime** (Settings > Variables and secrets, type *Text*) | no | server-only override used by Server Components. Verified LOCAL that a Worker variable reaches server code |
| `NEXT_PUBLIC_CHECKOUT_TEST_ORIGIN` | never | no | local fake-Stripe only |

**Secrets: this application needs none.** Every value above is public by design. The service-role key, database credentials, R2 keys and Stripe keys belong to the API, never to this Worker. Do not add any to `wrangler.jsonc`, `.dev.vars` or Git. (`.dev.vars` is for local `cf:preview` only and is git-ignored.)

Template with placeholders: `../ana-depot-api/docs/staging/web.staging.env.template`; local example: `.env.example`.

### Settings outside Cloudflare that must match
- **API**: `ANA_CORS_ALLOWED_ORIGINS` = the Worker origin(s); `ANA_TERMS_VERSION` = `NEXT_PUBLIC_TERMS_VERSION`.
- **Supabase Auth** (hosted project): Site URL = the Worker origin; redirect allow-list includes `https://<origin>/fr/auth/callback` and `/ht/auth/callback`.

## 5. Compatibility findings (LOCAL, workerd, stub API)

Build: `opennextjs-cloudflare build` succeeds (about 25 s here); bundle **12.1 MiB / 2.3 MiB gzip** (`wrangler deploy --dry-run`). Free-plan gzip limit is 3 MiB, paid 10 MiB. CPU limits of the free plan were not measured; Workers Paid is the realistic choice for SSR.

Compared with `next start` on the same build (status codes): `/fr`, `/ht`, `/` (307 by language), search, catalog, unknown product/category (**404**, via the proxy rewrite), info pages, auth pages, `/fr/admin`, `/fr/account`, legacy `/login` redirect (307), cart/reserve/reservations, `/sw.js`, manifest, robots, sitemap, `/nope-page` (307 to `/fr/nope-page`): identical. One difference was found and fixed (`/offline.html`, below).

| Area | Result |
|---|---|
| SSR / ISR | works: ISR pages come from the R2 cache and are regenerated at runtime (verified, section 6 item 9); dynamic pages render per request |
| Route handlers | `/api/revalidate-catalog`: 401 without a token, 403 for a non-staff token, 200 for staff (stub `/me`); `/sw.js` is prerendered at build, so its build-time `fs` read is not a Workers problem; auth callback redirects like `next start` |
| `src/proxy.ts` (Node proxy) | locale redirect, 404 rewrite and session refresh run. The adapter prints "Node.js middleware support is experimental" |
| Authentication | pages render; garbage/expired cookies behave like `next start`. **Real flows on the Worker runtime** (`npm run e2e:auth-flows` against the preview on :3100 with the local Supabase stack, stub for `/me`): sign-up, verification e-mail (fr and ht), resend, unverified sign-in, verification link, session cookie, sign-out, protected pages, `?next=`, used links rejected, recovery and reset, session refresh and unrefreshable session, duplicate registration: **45/45** |
| Admin gate | unauthenticated `/fr/admin` renders the sign-in gate as in `next start`; staff access needs real Supabase + API and was NOT tested here |
| Catalog cache | a changed API answer is not visible inside the 60 s window; after the staff revalidation the next-but-one read shows it; `API_BASE_URL` runtime variable is honoured |
| Security headers | CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `nosniff` present on Worker responses; auth/account/admin pages `private, no-store` |
| Images | the app only uses `next/image` with `unoptimized` remote URLs and SVG files in `public/`; no `/_next/image` optimization is needed and no Cloudflare Images binding is configured. If raster files are ever served from `public/` through `next/image`, add an `images` binding (see the OpenNext "Image Optimization" guide) |
| Soak and RSC | `npm run cf:soak` 7 minutes (544 requests, past two revalidation windows, with and without cookies): 0 failures; `npm run cf:smoke` 3 rounds: 123/123; real Chromium (`npm run cf:browser-smoke`): client navigation on every link, 110 `?_rsc=` responses, no 5xx, no React errors, 390 and 1280 px, fr and ht |
| Quality gates | `tsc --noEmit` clean, `npm test` 351/351, `npm run lint` 0 errors (2 warnings), bundle secret scan clean |

Static files (`/_next/static/*`, everything in `public/`) are served by Cloudflare **without running the app**, so the headers from `next.config.ts` (CSP etc.) do not apply to them. They apply to every HTML page and route handler.

## 6. Problems found and how they were handled

1. **Missing cache = 500 on every HTML page.** With the adapter's default (no cache) the Worker answered "code had hung". The app uses ISR pages, the data cache and `revalidateTag`, so `open-next.config.ts` configures an R2 incremental cache, a Durable Object queue and a Durable Object tag cache, and `cf:deploy` fills the cache on every deployment. **Never deploy with plain `wrangler deploy`** (it skips the cache fill).
2. **`revalidateTag(tag, { expire: 0 })` hung on Workers (while Cache Components were on; item 9 is the general finding).** After a staff catalog change, `/fr`, `/ht` and `/sitemap.xml` answered 500 (reproduced every time). The route now uses `"max"` (stale-while-revalidate, the mode Next recommends): the first visit after a change still shows the old data, the next one the new data. Time-based revalidation (the 60 s window) was verified to work. If you want instant freshness back, test `{ expire: 0 }` again after an OpenNext upgrade.
3. **Every request with a `Cookie` header answered 500** (`Cannot read properties of undefined (reading 'parse')` in OpenNext's middleware converter): `@opennextjs/aws` 4.2.0 default-imports `cookie`, and `cookie@1.1.1` has no default export. This would have broken every signed-in visitor and every visitor with a language cookie. Fixed with a scoped `overrides` entry (`@opennextjs/aws` -> `cookie 0.7.2`); `@supabase/ssr` keeps its own `cookie@1.1.1`. No upstream fix was found. **Remove the override when an OpenNext release fixes it** (test: build, `curl -H "Cookie: a=b" <worker>/fr` must be 200).
4. **`/offline.html` was redirected to `/offline`** by Workers static assets; the service worker precaches `/offline.html`. Fixed with `assets.html_handling: "none"`.
5. **`npm ci` fails on npm 10** (this repo's lockfile was written by npm 11; it failed before this change too, because of `@emnapi/runtime`). Workers Builds defaults to npm 10.9.2, so `packageManager` pins `npm@11.6.1`; `npm ci --dry-run` passes with it.
6. **Build needs the API.** `next build` prerenders catalog pages from the live API (identical with plain `next build`: it fails with an unreachable `NEXT_PUBLIC_API_BASE_URL`). Section 7.
7. **"No such Durable Object class is exported: DOQueueHandler / DOShardedTagCache" is a harmless message, not a missing export.** The generated Worker (`.open-next/worker.js`) and the final `wrangler` bundle both export `DOQueueHandler`, `DOShardedTagCache` and `BucketCachePurge`, the names match `wrangler.jsonc`, and migration `v1` creates both bound classes as SQLite classes. The message is printed by the adapter's own `getPlatformProxy` step at the start of `opennextjs-cloudflare deploy` / `preview` (right after the banner, before the cache is populated and before the Worker runs); that step loads `wrangler.jsonc` without the Worker code, so it cannot see classes that live in the Worker. OpenNext lists it under [Known issues](https://opennext.js.org/cloudflare/known-issues). A real problem would show in the deployed Worker's own logs (Observability) or as a failed upload, not in the deploy step output. `BucketCachePurge` is exported by the adapter but unused (no cache purge configured), so it needs no binding or migration.
8. **(was an open risk, now resolved by item 9)** the build used to print "Cache Components are not fully supported on Cloudflare yet" and Next warned about `setTimeout()`; neither appears with the classic model.
9. **The deployed development Worker answered `GET /ht?_rsc=…` with 500 "The Workers runtime canceled this request because it detected that your Worker's code had hung". Root cause: Next.js Cache Components on Cloudflare Workers.**
   - **Mechanism (reproduced in workerd, `wrangler dev` through `opennextjs-cloudflare preview`).** With `cacheComponents` the home page, the sitemap and the catalog placeholder pages were prerendered with a finite lifetime (`revalidate 1m`, `expire 1h`, build output `○ /fr 1m 1h`). Once such a page is stale the server must regenerate it by running a Cache-Components prerender at request time. On Workers that prerender never completes. While a stale copy exists the failure is invisible: the stale page is served, and the log shows "Next.js cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of `setTimeout()`" followed by "The Workers runtime canceled this request because it detected that your Worker's code had hung" (first seen at the first stale request, 4 minutes before any visitor noticed). When the entry passes `expire` there is nothing left to serve, Next's response cache keeps the never-settling regeneration promise in a process-wide batcher, and **every request for that page fails with HTTP 500 until the next deployment** ("This promise was created by a request that has since ended"). `/ht?_rsc=` is the RSC (client navigation or prefetch) request for the same cached page, so it fails the same way. On the real Worker the trigger is the first request after the entry is an hour old (the build's prerender time plus `expire`), which is why a freshly deployed Worker can look healthy.
   - **Evidence.** A scratch copy with only `expire` shortened to 301 s (so the pages stay static, `○ 1m ≈5m`) answered 200 on `/ht`, `/fr`, `/ht?x=N` for 4 minutes 30 s and then **500 on every request from the first one after expiry**, with the errors above. The same repository with `expire` under 5 minutes (pages become partial prerenders) never failed, which isolates regeneration of static Cache-Components pages as the failing operation. With `cacheComponents` off, ISR regeneration was verified on the same runtime: new catalog data reached `/fr` after the 60 s windows, the sitemap and `/ht` stayed 200 during a 7-minute soak (544 requests, with and without cookies), staff revalidation showed the new data on the second read, and the Worker logged no error or warning at all (no hang, no cross-request error, no postponed-state message, no `setTimeout()` warning). The `setTimeout()` warning is **not** the cause: Next only logs it when Node's `_idleStart` timer field is missing and continues with plain timers (`app-render-scheduling.js`); it is printed when the Cache-Components prerender starts, so it marks where the hang begins.
   - **Authentication was not involved.** The hang reproduces for anonymous requests with no cookie and no Supabase call. The authentication refactoring only coincided with the first visit after expiry. The Supabase session flows (sign-up, e-mail verification, session refresh, sign-out, recovery; fr and ht; with and without cookies) pass 45/45 on the Worker runtime.
   - **First attempt, rejected.** Giving the `"use cache"` function an `expire` under 300 s (documented: Next then leaves it out of prerenders) removed the 500s, but moved `/fr` and `/ht` onto the partial-prerender resume path, where Chromium logged React error #419 ("The server could not finish this Suspense boundary") on the home page and `Failed to parse postponed state` (`RangeError`) appeared under concurrent load. Those are further symptoms of the same unsupported feature, so the model was changed instead.
   - **Fix.** `cacheComponents` and `partialPrefetching` are off (`next.config.ts`); the catalog cache is `unstable_cache` (60 s, tag `catalog`); pages are classic ISR pages (`● /fr 1m`). `scripts/check-no-cache-components.mjs` runs after every `cf:build*` and fails the build if either setting returns; `src/lib/cloudflare-guard.test.ts` tests it.
   - **Trade-offs.** (a) Pages are ISR HTML: the home page is regenerated at most once a minute per Worker instead of being a prerendered shell plus a request-time hole; the SEO and server-rendered HTML are unchanged. (b) A stale copy is served for as long as regeneration keeps failing, instead of 500 after an hour; with classic ISR regeneration works. (c) Next's newer cache primitives (`"use cache"`, `cacheLife`, partial prerendering) are unavailable until OpenNext supports them; revisit after OpenNext's Cache Components support (the adapter prints a link to its tracking pull request) with `npm run cf:soak` as the acceptance test. (d) No dependency changed: Next 16.4.6, OpenNext 1.20.18 and `@opennextjs/aws` 4.2.0 are the latest releases.
   - **How to verify a Worker (local or deployed).** `npm run cf:soak -- <url>` (default 7 minutes, runs past a revalidation), `npm run cf:browser-smoke -- <url>` (real Chromium: client navigation, prefetch, `?_rsc=`, React errors) and `npm run cf:smoke -- <url>`. A short smoke test cannot see this failure, because it appears minutes to an hour after the first healthy request. For a Worker behind Cloudflare Access export `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` (a service token) first.
10. **Side effect found and fixed: `/sw.js` answered 500 after the switch to the classic model.** Route handlers are dynamic by default in Next.js 15+, and `/sw.js` reads `src/pwa/*.js` from disk when it runs; a Worker has no `src/` directory ("no such file or directory, readAll '/bundle/src/pwa/policy.js'"). With Cache Components it had been prerendered at build only as a side effect. The route now declares `export const dynamic = "force-static"` (tested in `src/lib/cloudflare-guard.test.ts`); `cf:smoke` requests `/sw.js`, so the service worker (and the offline page it precaches) cannot silently break again.
11. **Observed and not fixed (Cache Components only): a postponed-state parse message under concurrency.** While Cache Components were on, `Failed to parse postponed state` (`RangeError ERR_OUT_OF_RANGE`) was logged on the home page under concurrent requests; Next recovers (empty resume cache) and responses stayed 200. It does not occur with the classic model. Cause not investigated.

## 7. First deployment checklist (order matters)

1. Hosted Supabase project and the API are running and migrated; the API's public URL is reachable **from Cloudflare's build machines** and lists the Worker origin in `ANA_CORS_ALLOWED_ORIGINS` (the `workers.dev` URL is known only after the first deploy: deploy once, then add it).
2. Create the Worker from the repository (name `ana-depot-web`), set the settings of section 3 and the **build variables** of section 4 (staging values first, never production by mistake).
3. Trigger a build (push to `main` or "Retry build"). Expected: the `Node.js middleware ... experimental` warning (the Cache Components warning no longer appears), the Durable Object message of section 6 item 7, then "Populating remote R2 incremental cache", then a deployed version.
4. Smoke test the deployed URL; **any 5xx fails the release**:
   `/fr`, `/ht`, `/` (307), `/fr/products`, `/fr/products/<unknown>` (404), `/fr/auth/login`, `/fr/admin` (sign-in gate), `/sitemap.xml`, `/robots.txt`, `/sw.js`, `/offline.html` (200, no redirect), and the same with `-H "Cookie: a=b"`.
5. Sign in as a staff user and as a customer; change a product and confirm the storefront shows it on the second visit.
6. Only then: custom domain, `SECURITY_HTTPS_ONLY=true` (HSTS lasts 2 years per host), rebuild.

Rollback: Workers & Pages > `ana-depot-web` > Deployments > roll back to a previous version. Check the first page loads after a rollback: the cache bucket is shared by all versions.

## 8. Local commands

```bash
npm run cf:build     # build the Worker bundle into .open-next/ (needs the build variables in the shell or .env.local, and the API reachable)
npm run cf:preview   # build, fill a LOCAL simulated cache and run the Worker in workerd on :8787
npm run cf:deploy    # DEPLOYS to Cloudflare (what Workers Builds runs). Not for casual use.
npm run cf:upload    # uploads a new Worker version without deploying it
```
Stop a preview with `fuser -k 8787/tcp` (the preview leaves child processes; stop its `wrangler dev` parent as well).
Verification suites that need the real stack (`e2e:*`) were not run against the Worker.
