import "server-only";
import { unstable_cache } from "next/cache";
import type { CatalogQuery } from "../catalog-types";
import { DEFAULT_PAGE_SIZE } from "../catalog-query";
import { serverApiBaseUrl } from "./base-url";
import type { CategoryDto, PageDto, ProductDto } from "./dto";
import { toApiQuery } from "./public";

/**
 * Server-side reads of the PUBLIC catalog (no token, no cookies), used to render product, category and listing pages on the server so crawlers and slow phones get real HTML.
 * The API stays the single source of truth: these functions only fetch and cache its answers.
 *
 * Caching: every answer is cached for 60 s with `unstable_cache` (the data cache, tagged `catalog`) and the pages that use it are ISR pages that regenerate every 60 s. `POST /api/revalidate-catalog`
 * (staff only) marks the tag stale after a catalog change (stale-while-revalidate), so a published/edited product shows on the storefront from the second visit on instead of after the window.
 * A failure of the API is never cached (the function throws). This is the classic App Router caching model on purpose: the Next.js 16 `"use cache"` / Cache Components model is not
 * supported on Cloudflare Workers by OpenNext and broke the storefront there (docs/cloudflare-deployment.md, section 6), so `cacheComponents` stays off (next.config.ts).
 *  - 404 -> `{ status: "missing" }` (a real 404 page: unknown, draft and inactive products are indistinguishable by design).
 *  - API not configured -> `{ status: "unconfigured" }` (the page falls back to loading in the browser, which reports the configuration problem).
 *  - Any other failure throws: the page answers 5xx, never a soft 404, and nothing wrong is cached.
 */
export type Loaded<T> = { status: "ok"; data: T } | { status: "missing" } | { status: "unconfigured" };

export const CATALOG_TAG = "catalog";
const TIMEOUT_MS = 8000;

type CachedAnswer = { status: "ok"; body: unknown } | { status: "missing" } | { status: "unconfigured" };

async function fetchAnswer(path: string): Promise<CachedAnswer> {
  const base = serverApiBaseUrl();
  if (!base) return { status: "unconfigured" };
  const res = await fetch(`${base.replace(/\/+$/, "")}${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (res.status === 404) return { status: "missing" };
  if (!res.ok) throw new Error(`catalog_fetch_failed:${res.status}`);
  return { status: "ok", body: await res.json() };
}

const cachedGet = (path: string): Promise<CachedAnswer> => unstable_cache(() => fetchAnswer(path), ["catalog", path], { revalidate: 60, tags: [CATALOG_TAG] })();

async function get<T>(path: string): Promise<Loaded<T>> {
  const r = await cachedGet(path);
  return r.status === "ok" ? { status: "ok", data: r.body as T } : r;
}

const qs = (params: Record<string, string | number | boolean | string[] | undefined>): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) sp.append(k, String(item));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export const loadCategories = () => get<CategoryDto[]>("/api/v1/categories");
export const loadCategory = (slug: string) => get<CategoryDto>(`/api/v1/categories/${encodeURIComponent(slug)}`);
export const loadProductBySlug = (slug: string) => get<ProductDto>(`/api/v1/products/${encodeURIComponent(slug)}`);
export const loadProductPage = (query: CatalogQuery, size: number = DEFAULT_PAGE_SIZE) =>
  get<PageDto<ProductDto>>(`/api/v1/products${qs(toApiQuery({ ...query, q: undefined }, size))}`);

/** Every public product and category (paged, 100 per request): for the sitemap. A failed page throws, so a partial sitemap is never published as complete. */
export async function loadAllPublic(): Promise<Loaded<{ categories: CategoryDto[]; products: ProductDto[] }>> {
  const categories = await loadCategories();
  if (categories.status !== "ok") return categories;
  const products: ProductDto[] = [];
  for (let page = 0; ; page++) {
    const r = await get<PageDto<ProductDto>>(`/api/v1/products${qs({ page, size: 100 })}`);
    if (r.status !== "ok") return r.status === "unconfigured" ? r : { status: "ok", data: { categories: categories.data, products } };
    products.push(...r.data.items);
    if (page + 1 >= r.data.totalPages) break;
  }
  return { status: "ok", data: { categories: categories.data, products } };
}
