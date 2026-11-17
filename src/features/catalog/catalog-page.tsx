import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import { loadCategories, loadCategory, loadProductPage } from "@/lib/api/server-catalog";
import type { CatalogInitial } from "@/lib/api/catalog-hooks";
import { isPlainListing, parseCatalogQuery } from "@/lib/catalog-query";
import { CatalogSkeleton } from "./catalog-skeleton";
import { CatalogView } from "./catalog-view";

type SearchParams = PageProps<"/[locale]/products">["searchParams"];
interface Props { searchParams: SearchParams; locale: Locale; mode: "browse" | "search"; basePath: string }

/**
 * Shared catalog page for /products and /search. The URL carries all filter state, so every filtered view is
 * linkable. Reading searchParams is a request-time API, so it streams inside <Suspense>; the list itself is
 * rendered by <CatalogView>, which asks the API for that page of results.
 */
export function CatalogPage({ searchParams, mode, basePath }: Props) {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <Content searchParams={searchParams} mode={mode} basePath={basePath} />
    </Suspense>
  );
}

async function Content({ searchParams, mode, basePath }: Pick<Props, "searchParams" | "mode" | "basePath">) {
  const query = parseCatalogQuery(await searchParams);
  return <CatalogView query={query} mode={mode} basePath={basePath} initial={mode === "browse" ? await serverInitial(query) : undefined} />;
}

/**
 * The first answer, fetched on the server (cached, see server-catalog.ts) so the HTML already lists the products. A text search is user-specific and stays in the browser.
 * Any problem (API not configured, API down, unknown category) leaves `initial` empty: the browser then loads and reports it exactly as before.
 */
async function serverInitial(query: ReturnType<typeof parseCatalogQuery>): Promise<CatalogInitial | undefined> {
  // Only the plain listing (category, sort, page) is rendered and cached on the server: every filter combination would otherwise be a cache entry an outsider can mint at will.
  if (!isPlainListing(query)) return undefined;
  try {
    const [categories, page, category] = await Promise.all([loadCategories(), loadProductPage(query), query.category ? loadCategory(query.category) : Promise.resolve(undefined)]);
    if (categories.status !== "ok" || page.status !== "ok" || (category && category.status !== "ok")) return undefined;
    return { categories: categories.data, page: page.data, category: category?.status === "ok" ? category.data : undefined };
  } catch {
    return undefined;
  }
}
