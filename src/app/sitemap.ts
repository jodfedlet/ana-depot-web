import type { MetadataRoute } from "next";
import { loadAllPublic } from "@/lib/api/server-catalog";
import { buildSitemap } from "@/lib/seo/sitemap";
import { siteOrigin } from "@/lib/seo/site";

/**
 * sitemap.xml: generated from the live public catalog (only published products and active categories can appear: that is all the public API returns), both languages with
 * hreflang alternates. Cached with the catalog (60 s, dropped on demand when staff change it). If the API is down the request fails (5xx) rather than publishing a partial list.
 * One file holds 50,000 URLs (25,000 products across two languages); split with `generateSitemaps` if the catalog ever grows that large.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const loaded = await loadAllPublic();
  const source = loaded.status === "ok" ? { categories: loaded.data.categories, products: loaded.data.products } : { categories: [], products: [] };
  return buildSitemap(source, origin);
}
