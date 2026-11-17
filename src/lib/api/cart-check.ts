"use client";

import { useMemo } from "react";
import { useLocale } from "@/i18n/provider";
import { type CartLine, type LineCheck, checkLine } from "../cart";
import type { Product } from "../catalog-types";
import type { ProductDto } from "./dto";
import { ApiError } from "./http";
import { toProduct } from "./map-catalog";
import { getProduct } from "./public";
import { useApiResource } from "./use-resource";

export type CartIssue = Exclude<LineCheck, { kind: "ok" }>;

export interface CartCheck {
  /** The check ran against the server's current data (false while loading or after a failure: nothing is then claimed about stock or prices). */
  checked: boolean;
  loading: boolean;
  error: unknown;
  /** Lines that cannot be reserved as they are, by cart line key. Empty when `checked` and everything is in order. */
  issues: Record<string, CartIssue>;
  /** The cart's lines rebuilt from the current prices (quantities untouched), for the explicit "update prices" action. */
  refreshed: CartLine[];
  reload: () => void;
}

type Fetched = Record<string, ProductDto | "missing">;

/**
 * Revalidates a cart against the API: every distinct product is loaded again (public `GET /products/{id}`) and each line is compared with what
 * the server says now — still published, still sold in that currency, variant still there, enough available units (HTG and USD lines of one item
 * share one stock), unit price unchanged. The browser cart is never trusted for prices or stock; the server prices again when the reservation is submitted.
 */
export function useCartCheck(lines: CartLine[]): CartCheck {
  const locale = useLocale();
  const ids = useMemo(() => [...new Set(lines.map((l) => l.productId))].sort(), [lines]);
  const key = ids.length ? `cart:${ids.join(",")}` : null;
  const { data, loading, error, reload } = useApiResource<Fetched>(key, async (signal) => {
    const entries = await Promise.all(ids.map(async (id) => {
      try {
        return [id, await getProduct(id, { signal })] as const;
      } catch (e) {
        if (e instanceof ApiError && e.problem.status === 404) return [id, "missing" as const] as const; // unpublished or deleted: unavailable
        throw e; // any other failure: we know nothing, so claim nothing
      }
    }));
    return Object.fromEntries(entries);
  });

  return useMemo<CartCheck>(() => {
    const current = key !== null && data !== undefined && ids.every((id) => id in data) && !loading;
    if (!current) return { checked: false, loading, error, issues: {}, refreshed: lines, reload };
    const products = new Map<string, Product | undefined>(ids.map((id) => [id, data[id] === "missing" ? undefined : (toProduct(data[id] as ProductDto, locale) ?? undefined)]));
    const demand = new Map<string, number>();
    for (const l of lines) demand.set(`${l.productId}:${l.variantId ?? ""}`, (demand.get(`${l.productId}:${l.variantId ?? ""}`) ?? 0) + l.quantity);
    const issues: Record<string, CartIssue> = {};
    const refreshed = lines.map((l) => {
      const result = checkLine(l, products.get(l.productId), demand.get(`${l.productId}:${l.variantId ?? ""}`) ?? l.quantity);
      if (result.kind === "unavailable" || result.kind === "insufficient") { issues[l.key] = result; return l; }
      if (result.kind === "changed") issues[l.key] = result;
      return result.line;
    });
    return { checked: true, loading, error, issues, refreshed, reload };
  }, [data, ids, key, lines, loading, error, locale, reload]);
}
