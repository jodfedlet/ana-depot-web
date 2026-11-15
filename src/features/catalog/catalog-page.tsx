import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import { parseCatalogQuery } from "@/lib/catalog-query";
import { CatalogSkeleton } from "./catalog-skeleton";
import { CatalogView } from "./catalog-view";

type SearchParams = PageProps<"/[locale]/products">["searchParams"];
interface Props { searchParams: SearchParams; locale: Locale; mode: "browse" | "search"; basePath: string }

/**
 * Shared catalog page for /products and /search. The URL carries all filter state, so every filtered view is
 * linkable. Reading searchParams is a request-time API, so it streams inside <Suspense>; the list itself is
 * rendered by <CatalogView>, which reads the demo catalog store (so seller edits appear immediately).
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
  return <CatalogView query={query} mode={mode} basePath={basePath} />;
}
