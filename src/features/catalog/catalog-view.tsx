"use client";

import { Compass, PackageSearch, SearchX } from "lucide-react";
import { useMemo } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { useT } from "@/i18n/provider";
import { useStorefront } from "@/lib/catalog/hooks";
import { activeFilterCount, catalogHref, queryCatalog } from "@/lib/catalog-query";
import type { CatalogQuery } from "@/lib/catalog-types";
import { market } from "@/config/market";
import { currencyDigits, minorToMajor } from "@/lib/money";
import { CatalogSkeleton } from "./catalog-skeleton";
import { CatalogToolbar, FilterSidebar, type CatalogFilterData } from "./filter-panel";
import { Pagination } from "./pagination";
import { ProductGrid } from "./product-card";

export function CatalogView({ query, mode, basePath }: { query: CatalogQuery; mode: "browse" | "search"; basePath: string }) {
  const t = useT();
  const { ready, categories, products } = useStorefront();
  const names = useMemo(() => Object.fromEntries(categories.map((c) => [c.slug, c.name])), [categories]);
  const result = useMemo(() => queryCatalog(products, query, names), [products, query, names]);
  const category = query.category ? categories.find((c) => c.slug === query.category) : undefined;

  if (!ready) return <CatalogSkeleton />;
  if (query.category && !category) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={<Compass aria-hidden />} title={t("errorPage.notFoundTitle")} description={t("errorPage.notFoundText")}>
          <ButtonLink href="/products">{t("errorPage.browse")}</ButtonLink>
        </EmptyState>
      </div>
    );
  }

  const currency = result.priceBounds?.currency ?? market.defaultProductCurrency; // minor digits only (both launch currencies use 2)
  const digits = currencyDigits(currency);
  const major = (n?: number) => (n === undefined ? undefined : minorToMajor(n, currency));
  const data: CatalogFilterData = {
    basePath, query, categories, facets: result.facets, brands: result.brands, priceBounds: result.priceBounds, currencies: result.currencies, priceSortGrouped: result.priceSortGrouped, total: result.total, digits,
    priceMajor: { min: major(query.minPrice), max: major(query.maxPrice), boundsMin: major(result.priceBounds?.min), boundsMax: major(result.priceBounds?.max) },
  };

  const searching = mode === "search";
  const title = searching ? (query.q ? t("catalog.resultsFor", { q: query.q }) : t("catalog.search")) : (category?.name ?? t("catalog.allProducts"));
  const home = { label: t("catalog.home"), href: "/" };
  const crumbs: Crumb[] = searching ? [home, { label: t("catalog.search") }] : category ? [home, { label: t("catalog.shop"), href: "/products" }, { label: category.name }] : [home, { label: t("catalog.shop") }];
  const filters = activeFilterCount(query);
  const clear = catalogHref(basePath, query, { currency: undefined, minPrice: undefined, maxPrice: undefined, inStockOnly: false, wholesaleOnly: false, brands: [], attributes: {} }, digits);

  return (
    <div className="container-page py-6 sm:py-8">
      <Breadcrumbs items={crumbs} />
      <header className="mt-4 sm:mt-6">
        <h1 className="text-h1">{title}</h1>
        <p className="text-body mt-1.5 text-ink-soft">
          {category && !searching ? `${category.description} ` : ""}
          <span className="sm:hidden">{t("catalog.count", { count: result.total })}</span>
        </p>
      </header>

      <div className="mt-6 grid gap-x-10 gap-y-6 lg:mt-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <FilterSidebar data={data} />
        <div>
          <CatalogToolbar data={data} />
          <div className="mt-6">
            {result.products.length > 0 ? (
              <>
                <h2 className="sr-only">{t("catalog.productsHeading")}</h2>
                <ProductGrid products={result.products} priorityCount={4} />
                <Pagination page={result.page} pageCount={result.pageCount} hrefs={Array.from({ length: result.pageCount }, (_, i) => catalogHref(basePath, query, { page: i + 1 }, digits))} />
              </>
            ) : searching && !query.q ? (
              <EmptyState icon={<PackageSearch aria-hidden />} title={t("catalog.searchTitle")} description={t("catalog.searchHint")}>
                <ButtonLink href="/products">{t("catalog.browseAll")}</ButtonLink>
              </EmptyState>
            ) : (
              <EmptyState icon={<SearchX aria-hidden />} title={searching ? t("catalog.noResultsTitle", { q: query.q ?? "" }) : t("catalog.emptyFiltersTitle")} description={filters > 0 ? t("catalog.emptyFiltersText") : t("catalog.noResultsText")}>
                {filters > 0 && <ButtonLink href={clear}>{t("catalog.clearFilters")}</ButtonLink>}
                <ButtonLink href="/products" variant="outline">{t("catalog.browseAll")}</ButtonLink>
              </EmptyState>
            )}
          </div>
          {result.products.length === 0 && searching && query.q && (
            <ul aria-label={t("catalog.browseCategories")} className="mt-2 flex flex-wrap justify-center gap-2">
              {categories.map((c) => <li key={c.slug}><ButtonLink href={`/products?category=${c.slug}`} variant="secondary" size="sm">{c.name}</ButtonLink></li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
