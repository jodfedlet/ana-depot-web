import type { CatalogQuery, SortKey } from "./catalog-types";
import { sortKeys } from "./catalog-types";
import { isSupportedCurrency, majorToMinor } from "./money";
import { market } from "@/config/market";

/**
 * URL <-> `CatalogQuery`. The URL is the single source of truth for filters; the results themselves (filtering, full-text ranking, sorting,
 * paging) are computed by the API (`lib/api/public.ts#searchProducts`), never in the browser.
 */

export const DEFAULT_PAGE_SIZE = 12;

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** URL search params -> typed query. The URL is the single source of truth for filters. */
export function parseCatalogQuery(params: RawParams): CatalogQuery {
  const currencyParam = first(params.currency)?.toUpperCase();
  const currency = currencyParam && isSupportedCurrency(currencyParam) ? currencyParam : undefined;
  const sort = first(params.sort) as SortKey | undefined;
  const num = (v: string | undefined) => {
    if (v === undefined || v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const min = num(first(params.min));
  const max = num(first(params.max));
  const attributes: Record<string, string[]> = {};
  for (const entry of all(params.attr)) {
    const i = entry.indexOf(":");
    if (i < 1) continue;
    (attributes[entry.slice(0, i)] ??= []).push(entry.slice(i + 1));
  }
  const page = Number(first(params.page));
  return {
    q: first(params.q)?.trim() || undefined,
    category: first(params.category) || undefined,
    currency,
    minPrice: min === undefined ? undefined : majorToMinor(min, currency ?? market.defaultProductCurrency),
    maxPrice: max === undefined ? undefined : majorToMinor(max, currency ?? market.defaultProductCurrency),
    inStockOnly: first(params.stock) === "1",
    wholesaleOnly: first(params.wholesale) === "1",
    brands: all(params.brand),
    attributes,
    sort: sortKeys.some((k) => k === sort) ? sort : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Serialise a query back to URL params (omits defaults) for links and filter updates. */
export function toSearchParams(query: CatalogQuery, currencyDigits = 2): URLSearchParams {
  const sp = new URLSearchParams();
  if (query.q) sp.set("q", query.q);
  if (query.category) sp.set("category", query.category);
  if (query.sort) sp.set("sort", query.sort);
  if (query.currency) sp.set("currency", query.currency);
  if (query.minPrice !== undefined) sp.set("min", String(query.minPrice / 10 ** currencyDigits));
  if (query.maxPrice !== undefined) sp.set("max", String(query.maxPrice / 10 ** currencyDigits));
  if (query.inStockOnly) sp.set("stock", "1");
  if (query.wholesaleOnly) sp.set("wholesale", "1");
  query.brands?.forEach((b) => sp.append("brand", b));
  for (const [key, values] of Object.entries(query.attributes ?? {})) {
    values.forEach((v) => sp.append("attr", `${key}:${v}`));
  }
  if (query.page && query.page > 1) sp.set("page", String(query.page));
  return sp;
}

export function activeFilterCount(query: CatalogQuery): number {
  return (
    (query.currency ? 1 : 0) +
    (query.minPrice !== undefined || query.maxPrice !== undefined ? 1 : 0) +
    (query.inStockOnly ? 1 : 0) +
    (query.wholesaleOnly ? 1 : 0) +
    (query.brands?.length ?? 0) +
    Object.values(query.attributes ?? {}).reduce((n, v) => n + v.length, 0)
  );
}

/** Build a link to a catalog listing with a patch applied to the current query. */
export function catalogHref(
  basePath: string,
  query: CatalogQuery,
  patch: Partial<CatalogQuery> = {},
  currencyDigits = 2,
): string {
  const next = { ...query, ...patch };
  // any change except paging resets to the first page
  if (!("page" in patch)) next.page = 1;
  const qs = toSearchParams(next, currencyDigits).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
