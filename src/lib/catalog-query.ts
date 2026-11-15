import type {
  Availability,
  CatalogQuery,
  CatalogResult,
  FacetGroup,
  Product,
  SortKey,
} from "./catalog-types";
import { sortKeys } from "./catalog-types";
import { SUPPORTED_CURRENCIES, isSupportedCurrency, majorToMinor, sumByCurrency } from "./money";
import { market } from "@/config/market";

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

const unavailable: Availability = "out_of_stock";

function matchesText(p: Product, q: string, categoryName: string): boolean {
  const haystack = [p.name, p.description.join(" "), p.brand ?? "", categoryName, ...Object.values(p.attributes).map((a) => a.label)]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

const currencyRank = (c: string) => { const i = (SUPPORTED_CURRENCIES as readonly string[]).indexOf(c); return i === -1 ? SUPPORTED_CURRENCIES.length : i; };
/** Amounts of different currencies are never compared: price sorting groups by currency first, then by price. */
const byCurrency = (a: Product, b: Product) => currencyRank(a.price.currency) - currencyRank(b.price.currency) || a.price.currency.localeCompare(b.price.currency);

function sortProducts(list: Product[], sort: SortKey): Product[] {
  const copy = [...list];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "price-asc":
      return copy.sort((a, b) => byCurrency(a, b) || a.price.amount - b.price.amount);
    case "price-desc":
      return copy.sort((a, b) => byCurrency(a, b) || b.price.amount - a.price.amount);
    case "name-asc":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return copy.sort((a, b) => a.featuredRank - b.featuredRank);
  }
}

/** Facets are derived from the data, so filters adapt to any category without code changes. */
export function deriveFacets(products: Product[], minProducts = 3): FacetGroup[] {
  // An attribute is worth filtering on only if it spans several products and offers a real choice.
  const MIN_PRODUCTS = minProducts;
  const groups = new Map<string, { name: string; values: Map<string, { label: string; count: number }> }>();
  for (const p of products) {
    for (const [key, attr] of Object.entries(p.attributes)) {
      const group = groups.get(key) ?? { name: attr.name, values: new Map() };
      const entry = group.values.get(attr.id) ?? { label: attr.label, count: 0 };
      entry.count += 1;
      group.values.set(attr.id, entry);
      groups.set(key, group);
    }
  }
  return [...groups.entries()]
    .filter(([, g]) => g.values.size >= 2 && g.values.size <= 10 && [...g.values.values()].reduce((a, b) => a + b.count, 0) >= MIN_PRODUCTS)
    .map(([key, g]) => ({
      key,
      name: g.name,
      values: [...g.values.entries()]
        .map(([id, v]) => ({ id, label: v.label, count: v.count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }));
}

export function queryCatalog(
  allProducts: Product[],
  query: CatalogQuery,
  categoryNames: Record<string, string> = {},
): CatalogResult {
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const scoped = allProducts.filter(
    (p) =>
      (!query.category || p.categorySlug === query.category) &&
      (!query.q || matchesText(p, query.q, categoryNames[p.categorySlug] ?? "")),
  );

  const currencies = sumCounts(scoped);
  // Price ranges only make sense inside one currency: the selected one, or the only one in scope.
  const priceCurrency = query.currency ?? (currencies.length === 1 ? currencies[0].code : undefined);

  const filtered = scoped.filter((p) => {
    if (query.currency && p.price.currency !== query.currency) return false;
    if (priceCurrency) {
      if (query.minPrice !== undefined && p.price.amount < query.minPrice) return false;
      if (query.maxPrice !== undefined && p.price.amount > query.maxPrice) return false;
    }
    if (query.inStockOnly && p.availability === unavailable) return false;
    if (query.wholesaleOnly && !p.hasWholesale) return false;
    if (query.brands?.length && !(p.brand && query.brands.includes(p.brand))) return false;
    for (const [key, values] of Object.entries(query.attributes ?? {})) {
      if (values.length && !values.includes(p.attributes[key]?.id ?? "")) return false;
    }
    return true;
  });

  const sorted = sortProducts(filtered, query.sort ?? "featured");
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);

  const brandCounts = new Map<string, number>();
  for (const p of scoped) if (p.brand) brandCounts.set(p.brand, (brandCounts.get(p.brand) ?? 0) + 1);
  const prices = scoped.filter((p) => p.price.currency === priceCurrency).map((p) => p.price.amount);

  return {
    products: sorted.slice((page - 1) * pageSize, page * pageSize),
    total: sorted.length,
    page,
    pageCount,
    pageSize,
    // Inside one category the catalog is small, so a facet needs fewer products to be useful.
    facets: deriveFacets(scoped, query.category ? 2 : 3),
    brands: [...brandCounts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value)),
    priceBounds: priceCurrency && prices.length ? { min: Math.min(...prices), max: Math.max(...prices), currency: priceCurrency } : null,
    currencies,
    priceSortGrouped: (query.sort === "price-asc" || query.sort === "price-desc") && new Set(filtered.map((p) => p.price.currency)).size > 1,
  };
}

/** Product counts per currency, in launch order. */
function sumCounts(products: Product[]): { code: string; count: number }[] {
  const totals = sumByCurrency(products.map((p) => ({ amount: 1, currency: p.price.currency })));
  return totals.map((t) => ({ code: t.currency, count: t.amount }));
}

/** Serialise a query back to URL params (omits defaults) for links and filter updates. */
export function toSearchParams(query: CatalogQuery, currencyDigits = 2): URLSearchParams {
  const sp = new URLSearchParams();
  if (query.q) sp.set("q", query.q);
  if (query.category) sp.set("category", query.category);
  if (query.sort && query.sort !== "featured") sp.set("sort", query.sort);
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
