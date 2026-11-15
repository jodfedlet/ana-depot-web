"use client";

import { useCallback, useMemo } from "react";
import { type CartAction, type CartLine, cartItemCount, cartReducer, cartSubtotals } from "../cart";
import { createPersistedStore, useIsClient } from "./create-persisted-store";

// v2: cart lines carry their pricing currency (v1 snapshots had none).
const store = createPersistedStore<CartLine[]>("ana.demo.cart.v2", []);

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
      /** One subtotal per currency; never merged. */
      subtotals,
      mixedCurrency: subtotals.length > 1,
      add: (line: CartLine) => dispatch({ type: "add", line }),
      setQuantity: (key: string, quantity: number) => dispatch({ type: "setQuantity", key, quantity }),
      remove: (key: string) => dispatch({ type: "remove", key }),
      clear: () => dispatch({ type: "clear" }),
    };
  }, [lines, ready, dispatch]);
}
