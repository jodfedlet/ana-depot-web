"use client";

import { useMemo } from "react";
import { useLocale } from "@/i18n/provider";
import type { CatalogQuery, CatalogResult, Category, FacetGroup, Product } from "../catalog-types";
import { DEFAULT_PAGE_SIZE } from "../catalog-query";
import type { CategoryDto, PageDto, ProductDto } from "./dto";
import { ApiError } from "./http";
import { pickText, toCategory, toProduct } from "./map-catalog";
import { getCategory, getProduct, listCategories, searchProducts, toApiQuery } from "./public";
import { type Resource, useApiResource } from "./use-resource";

/** Categories change rarely and every page needs them (navigation, filters, card labels): share one answer for a short while. */
const CATEGORY_TTL_MS = 60_000;
let categoryCache: { at: number; promise: Promise<CategoryDto[]> } | null = null;
function cachedCategories(): Promise<CategoryDto[]> {
  const now = Date.now();
  if (!categoryCache || now - categoryCache.at > CATEGORY_TTL_MS) {
    const promise = listCategories();
    categoryCache = { at: now, promise };
    promise.catch(() => { if (categoryCache?.promise === promise) categoryCache = null; }); // a failure is never cached
  }
  return categoryCache.promise;
}
/** Test hook: forget the shared category answer. */
export const resetCategoryCache = () => { categoryCache = null; };

/** Answers a server-rendered page already fetched (see `lib/api/server-catalog.ts`): the hooks start from them instead of loading again. */
export interface CatalogInitial { categories?: CategoryDto[]; page?: PageDto<ProductDto>; category?: CategoryDto }
export interface ProductInitial { product: ProductDto; category?: CategoryDto; related?: PageDto<ProductDto> }

export function useCategories(initial?: CategoryDto[]): { categories: Category[]; dtos: CategoryDto[]; loading: boolean; error: unknown; reload: () => void } {
  const locale = useLocale();
  const { data, loading, error, reload } = useApiResource("categories", () => cachedCategories(), initial);
  const dtos = useMemo(() => [...(data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder), [data]);
  const categories = useMemo(() => dtos.map((d) => toCategory(d, locale)), [dtos, locale]);
  return { categories, dtos, loading, error, reload };
}

export interface CatalogPageState {
  result: CatalogResult | undefined;
  facets: FacetGroup[];
  /** A request for the current query is running (the previous page, if any, stays in `result`). */
  loading: boolean;
  error: unknown;
  /** The selected category does not exist (404 from the API). */
  categoryMissing: boolean;
  reload: () => void;
}

/** Filterable CHOICE attributes of the selected category as filter groups: no counts, because the API does not provide them. */
function facetsOf(category: CategoryDto | undefined, locale: "fr" | "ht"): FacetGroup[] {
  return (category?.attributes ?? [])
    .filter((a) => a.filterable && a.type === "CHOICE" && a.options.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((a) => ({ key: a.key, name: pickText(a.label, locale), values: [...a.options].sort((x, y) => x.displayOrder - y.displayOrder).map((o) => ({ id: o.code, label: pickText(o.label, locale) || o.code })) }));
}

export function useCatalogPage(query: CatalogQuery, initial?: CatalogInitial): CatalogPageState {
  const locale = useLocale();
  const { dtos } = useCategories(initial?.categories);
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const key = JSON.stringify(toApiQuery(query, pageSize));
  const page = useApiResource<PageDto<ProductDto>>(key, (signal) => searchProducts(query, pageSize, { signal }), initial?.page);
  const category = useApiResource<CategoryDto>(query.category ? `category:${query.category}` : null, (signal) => getCategory(query.category as string, { signal }), initial?.category);

  const names = useMemo(() => new Map(dtos.map((c) => [c.slug, pickText(c.name, locale)])), [dtos, locale]);
  const result = useMemo<CatalogResult | undefined>(() => {
    const data = page.data;
    if (!data) return undefined;
    return {
      products: data.items.map((p) => toProduct(p, locale, undefined, names.get(p.categorySlug))).filter((p): p is Product => p !== null),
      total: data.totalItems,
      page: data.page + 1,
      pageCount: Math.max(1, data.totalPages),
      pageSize: data.size,
    };
  }, [page.data, locale, names]);

  const categoryMissing = category.error instanceof ApiError && category.error.problem.status === 404;
  return {
    result,
    facets: useMemo(() => facetsOf(category.data, locale), [category.data, locale]),
    loading: page.loading,
    error: page.error ?? (categoryMissing ? undefined : category.error),
    categoryMissing,
    reload: () => { page.reload(); category.reload(); },
  };
}

export interface ProductPageState {
  product: Product | null | undefined;
  /** Same category, other products, for the "you may also like" row. */
  related: Product[];
  notFound: boolean;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

/** One published product by slug (or id) with its category (for variant and specification names) and a few neighbours. */
export function useProductPage(slug: string, initial?: ProductInitial): ProductPageState {
  const locale = useLocale();
  const productRes: Resource<ProductDto> = useApiResource(`product:${slug}`, (signal) => getProduct(slug, { signal }), initial?.product);
  const categorySlug = productRes.data?.categorySlug;
  const categoryRes = useApiResource<CategoryDto>(categorySlug ? `category:${categorySlug}` : null, (signal) => getCategory(categorySlug as string, { signal }), initial?.category);
  const relatedRes = useApiResource<PageDto<ProductDto>>(categorySlug ? `related:${categorySlug}` : null, (signal) => searchProducts({ category: categorySlug }, 5, { signal }), initial?.related);

  const notFound = productRes.error instanceof ApiError && productRes.error.problem.status === 404;
  const dto = productRes.data;
  // Keep the loaded product only while it is the one asked for (a stale answer of the previous slug must not be shown).
  const current = dto && (dto.slug === slug || dto.id === slug) ? dto : undefined;
  const product = useMemo(() => (current ? toProduct(current, locale, categoryRes.data) : undefined), [current, locale, categoryRes.data]);
  const related = useMemo(
    () => (relatedRes.data?.items ?? []).filter((p) => p.id !== current?.id).slice(0, 4).map((p) => toProduct(p, locale)).filter((p): p is Product => p !== null),
    [relatedRes.data, current, locale],
  );
  return {
    product: notFound ? null : current ? product : undefined,
    related,
    notFound,
    // the category answer completes the variant labels: wait for it so options are never shown under raw ids
    loading: productRes.loading || (!!categorySlug && categoryRes.loading && !categoryRes.error),
    error: notFound ? undefined : productRes.error,
    reload: () => { productRes.reload(); categoryRes.reload(); relatedRes.reload(); },
  };
}
