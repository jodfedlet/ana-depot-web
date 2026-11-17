import type { MetadataRoute } from "next";
import { PRIVATE_PATHS } from "@/lib/seo/metadata";
import { siteOrigin } from "@/lib/seo/site";
import { locales } from "@/i18n/config";

/**
 * robots.txt. Public catalog pages are crawlable; administration, accounts, sign-in flows, the cart, search results and reservation/tracking pages are not (they hold no
 * indexable content, or belong to one person) and they also carry `noindex`. The sitemap line appears only when the public origin is configured (`NEXT_PUBLIC_SITE_URL`).
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  const disallow = PRIVATE_PATHS.flatMap((p) => [p, ...locales.map((l) => `/${l}${p}`)]).map((p) => `${p}`);
  return { rules: [{ userAgent: "*", allow: "/", disallow }], ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}
