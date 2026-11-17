# Discoverability (SEO) and performance

What makes the public storefront crawlable and fast, how it is cached, and what was measured. Business content is never invented: everything in the markup comes from the API or `siteConfig`.

## Configuration
| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | The public https origin of the storefront (e.g. `https://www.example.com`). **Required for production SEO**: canonical URLs, hreflang, Open Graph URLs, JSON-LD URLs, `sitemap.xml` and the `Sitemap:` line of `robots.txt` are built from it. Without it production emits none of them (and the build prints a warning); development falls back to `http://localhost:3000`. It is the owner's domain: nothing guesses it. |
| `NEXT_PUBLIC_ASSET_ORIGINS` | Image origins for the CSP (see `docs/security.md`). |
| `API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` | Where the server reads the public catalog from (server-side rendering, proxy, sitemap). |

## What is server-rendered
| Route | Rendering | Notes |
|---|---|---|
| `/{fr,ht}` | static shell + cached catalog data in the HTML | Organization + WebSite JSON-LD; categories and latest products listed with plain links |
| `/{locale}/products` | first page of the plain listing in the HTML (category/sort/page only; filters and text search stay in the browser) | every query variant canonicalizes to `/{locale}/products` |
| `/{locale}/categories/<slug>` | **new** clean landing page per category, first page of products in the HTML | canonical, BreadcrumbList; filters and further pages continue on `/products?category=<slug>` |
| `/{locale}/products/<slug>` | name, description, prices per currency, availability, images, specifications, JSON-LD and meta in the HTML | Product + Offer (one per currency) + BreadcrumbList |
| `/{locale}/info/<slug>` | static | the placeholder pages (returns, privacy, terms) are `noindex` and not in the sitemap |
| cart, search, reserve, reservations, account, auth, admin | `noindex` (and disallowed in robots.txt) | |

The client components receive the server's answers as initial data (`useApiResource(..., initial)`): no loading state, no duplicate request, no layout shift on first paint. Reloading or navigating loads from the API as before.

## HTTP statuses
A page that has started streaming cannot change its status (a "soft 404"), and with Cache Components the prerendered shell is sent first. So the **proxy** (`src/proxy.ts`, `lib/seo/catalog-exists.ts`) asks the public API whether the product/category exists *before* the page renders and rewrites to `/{locale}/missing` (a prerendered `notFound()`), which answers a real **404** with the storefront's 404 view and `noindex`. Unknown, draft and inactive products are indistinguishable by design (the API answers 404 for all). An API failure never becomes a 404: the request passes through and the page answers 5xx.
The proxy keeps a small in-memory answer cache (exists 60 s, missing 10 s, failures 3 s; at most 2000 entries).

## Caching and invalidation
`lib/api/server-catalog.ts` caches the public API's answers with `use cache` for 60 s (stale-while-revalidate up to 1 h), tag `catalog`; failures are never cached. Only plain listings are cached (a filter combination would otherwise let outsiders mint cache entries).
When staff change the catalog, `lib/api/admin/storefront-refresh.ts` calls `POST /api/revalidate-catalog` (after category, product, image, stock and stock-moving reservation writes). The route verifies the bearer token against `GET /api/v1/me` (`staff: true`) and expires the tag, so the change is visible at once. If that call fails the cache simply expires within a minute.

## Sitemap and robots
`/sitemap.xml` is generated from the live public catalog (paged 100 at a time; a failed page fails the request instead of publishing a partial list): home, listing, category pages, product pages and the information pages with real content, each in both languages with `hreflang` alternates. No `lastmod` (the public API has no modification date; a guessed one would mislead). One file holds 50 000 URLs: split with `generateSitemaps` if the catalog ever exceeds ~25 000 products.
`/robots.txt` allows the public site, disallows `/admin /account /auth /reserve /reservations /cart /search` (unprefixed and per language) and links the sitemap. Those pages also carry `noindex` for crawlers that ignore robots.txt. Decision: internal search results are not indexed (thin, infinite variants).

## Structured data (`lib/seo/jsonld.ts`, tested)
Organization (name from `siteConfig`, URL), WebSite (+ SearchAction pointing at the real search page), BreadcrumbList, Product + Offer. One `Offer` per currency with its own `priceCurrency` (HTG and USD are never combined; the sale price is the offer price); `AggregateOffer` (low/high) when variants carry their own price in a currency; availability only from the API. **Not emitted, on purpose:** ratings, reviews, shipping, return policy, address, phone, opening hours, wholesale tiers (not part of schema.org offers). The one `dangerouslySetInnerHTML` of the app is `components/seo/json-ld.tsx`; the serializer escapes `<`, `>`, `&`.

## Not covered / open
- Real search-engine indexing, Search Console, hosted deployment and CDN behaviour were not verified (local stack only).
- `lastmod`, product reviews and an organization logo/address need data the API/owner does not provide yet.
- The unmatched-URL 404 (`/fr/anything`) is Next's default page (right status, English text): a `global-not-found` page would localize it.
- Haitian Creole meta descriptions (`seo.*` in `ht/seo.ts`) need native review.
