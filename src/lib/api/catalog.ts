/**
 * Server-side catalog helpers used only to prerender a static shell (route params and metadata).
 * Real catalog data reaches the pages through the demo store hooks (src/lib/catalog/hooks.ts) and,
 * later, the Spring Boot API.
 */
import type { Locale } from "@/i18n/config";
import { pick } from "../localized";
import { seedProducts } from "../mock/catalog-seed";

export const listSeedSlugs = () => seedProducts.filter((p) => p.status === "active").map((p) => p.slug);
export const getSeedProductName = (slug: string, locale: Locale) => {
  const p = seedProducts.find((x) => x.slug === slug);
  return p ? pick(p.name, locale) : undefined;
};
