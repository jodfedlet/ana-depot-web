"use client";

import { useMemo } from "react";
import { useLocale } from "@/i18n/provider";
import type { Category, Product } from "../catalog-types";
import { catalogStore, useCatalogState } from "../stores/catalog-store";
import { useIsClient } from "../stores/create-persisted-store";
import { useReservations } from "../stores/reservation-store";
import { toCategory, toProduct } from "./localize";

export { catalogStore };

/** Active categories and products as customers see them (localized, with live availability). */
export function useStorefront(): { ready: boolean; categories: Category[]; products: Product[] } {
  const state = useCatalogState();
  const reservations = useReservations();
  const locale = useLocale();
  const ready = useIsClient();
  return useMemo(() => {
    const cats = state.categories.filter((c) => c.active).sort((a, b) => a.order - b.order);
    const bySlug = new Map(cats.map((c) => [c.slug, c]));
    const products = state.products
      .filter((p) => p.status === "active" && bySlug.has(p.categorySlug))
      .map((p) => toProduct(p, bySlug.get(p.categorySlug), locale, reservations))
      .sort((a, b) => a.featuredRank - b.featuredRank);
    return { ready, categories: cats.map((c) => toCategory(c, locale)), products };
  }, [state, reservations, locale, ready]);
}

export function relatedProducts(product: Product, all: Product[], limit = 4): Product[] {
  const byId = (product.relatedIds ?? []).map((id) => all.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
  const same = all.filter((p) => p.categorySlug === product.categorySlug && p.id !== product.id && !byId.includes(p));
  return [...byId, ...same].slice(0, limit);
}
