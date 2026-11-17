"use client";

import { useCallback, useMemo } from "react";
import { type CartAction, type CartLine, cartItemCount, cartReducer, cartSubtotals } from "../cart";
import { createPersistedStore, useIsClient } from "./create-persisted-store";

/**
 * The shopping selection. This is the ONE thing the storefront keeps in the browser: a temporary list of what the customer wants. It is never
 * the source of truth — prices and stock are re-read from the API (see `lib/api/cart-check.ts`) and the server prices the reservation.
 * v4: product ids are the API's UUIDs. Carts from the demo catalog (`ana.demo.cart.v3`) are discarded, never migrated: their ids and prices do not exist.
 */
const store = createPersistedStore<CartLine[]>("ana.cart.v4", []);

const LEGACY_DEMO_KEYS = ["ana.demo.cart.v3", "ana.demo.guestrefs.v1", "ana.demo.profile.v2"];
if (typeof window !== "undefined") {
  try {
    for (const k of LEGACY_DEMO_KEYS) window.localStorage.removeItem(k);
  } catch {
    /* storage blocked: nothing to clean */
  }
}

export function useCart() {
  const lines = store.useStore();
  const ready = useIsClient();
  const dispatch = useCallback((action: CartAction) => store.set((prev) => cartReducer(prev, action)), []);

  return useMemo(() => {
    const subtotals = cartSubtotals(lines);
    return {
      /** False until the client has read storage; render skeletons/neutral UI until then. */
      ready,
      lines,
      count: cartItemCount(lines),
      /** One subtotal per currency; never merged. An ESTIMATE from the prices seen when adding: the server's reservation totals are authoritative. */
      subtotals,
      mixedCurrency: subtotals.length > 1,
      add: (line: CartLine) => dispatch({ type: "add", line }),
      setQuantity: (key: string, quantity: number) => dispatch({ type: "setQuantity", key, quantity }),
      remove: (key: string) => dispatch({ type: "remove", key }),
      replace: (next: CartLine[]) => dispatch({ type: "replace", lines: next }),
      clear: () => dispatch({ type: "clear" }),
    };
  }, [lines, ready, dispatch]);
}
