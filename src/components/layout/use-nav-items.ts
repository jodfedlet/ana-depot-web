"use client";

import { useT } from "@/i18n/provider";
import { useStorefront } from "@/lib/catalog/hooks";

/** Navigation entries: fixed shortcuts plus one link per ACTIVE category (categories are data, not code). */
export function useNavItems(): { href: string; label: string }[] {
  const t = useT();
  const { categories } = useStorefront();
  return [
    { href: "/products", label: t("nav.shopAll") },
    { href: "/products?sort=newest", label: t("nav.newArrivals") },
    { href: "/products?wholesale=1", label: t("nav.wholesale") },
    ...categories.map((c) => ({ href: `/products?category=${c.slug}`, label: c.name })),
  ];
}
