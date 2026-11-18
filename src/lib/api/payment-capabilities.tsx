"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { UNKNOWN_CAPABILITIES, toCapabilities, type PaymentCapabilities } from "../payments/capabilities";
import { getPaymentOptions } from "./online-payments";
import { useApiResource } from "./use-resource";

interface Value extends PaymentCapabilities { loading: boolean }
const Context = createContext<Value | null>(null);

/**
 * ONE backend question for the whole storefront ("which payment options exist right now?"), asked once and again whenever the tab becomes visible after a while, so the wording on
 * the home page, the cart, the reservation flow and the tracking page can never disagree. A failed call is "unknown": the wording falls back to what is true in every case.
 */
export function PaymentCapabilitiesProvider({ children }: { children: ReactNode }) {
  const res = useApiResource("payment-options", (signal) => getPaymentOptions({ signal }));
  const { reload } = res;
  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) reload();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [reload]);
  const value = useMemo<Value>(() => ({ ...(res.error != null ? UNKNOWN_CAPABILITIES : toCapabilities(res.data)), loading: res.loading }), [res.data, res.error, res.loading]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** True only when the backend says card payment is available AND reservations are open: the one condition under which a card may be mentioned. */
export function useCardOffered(): boolean {
  return usePaymentCapabilities().mode === "both";
}

/** Outside the provider (an isolated test render) nothing is claimed: pay at pickup only. */
export function usePaymentCapabilities(): Value {
  return useContext(Context) ?? { ...UNKNOWN_CAPABILITIES, loading: false };
}
