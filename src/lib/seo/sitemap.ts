import type { MetadataRoute } from "next";
import { infoPages } from "@/config/site";
import { locales } from "@/i18n/config";
import { languageAlternates, localizedPath } from "./site";

/** What the sitemap needs from the API: only PUBLIC (published, active) products and categories ever reach this module, because that is all the public API returns. */
export interface SitemapSource {
  categories: { slug: string }[];
  products: { slug: string }[];
}

/**
 * One entry per language per public page, each with hreflang alternates. Included: home, catalog, category landing pages, product pages, information pages with real content (the placeholder ones are noindex).
 * Excluded on purpose: cart, search, reservation, tracking, account, auth and administration (private/utility pages), and any filtered/sorted/paged variant of the catalog
 * (they canonicalize to the base listing). `lastModified` is omitted: the public API does not expose a modification date and a guessed one would mislead crawlers.
 */
export function buildSitemap(source: SitemapSource, origin: string | null): MetadataRoute.Sitemap {
  if (!origin) return [];
  const paths = [
    "/",
    "/products",
    ...Object.entries(infoPages).filter(([, page]) => page.kind !== "placeholder").map(([slug]) => `/info/${slug}`),
    ...source.categories.map((c) => `/categories/${c.slug}`),
    ...source.products.map((p) => `/products/${p.slug}`),
  ];
  return paths.flatMap((path) => {
    const languages = languageAlternates(path, origin) ?? undefined;
    return locales.map((l) => ({ url: `${origin}${localizedPath(l, path)}`, ...(languages ? { alternates: { languages } } : {}) }));
  });
}
