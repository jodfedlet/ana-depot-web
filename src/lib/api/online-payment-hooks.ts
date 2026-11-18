"use client";

import { useCallback, useEffect, useState } from "react";
import { recallAccess } from "../reservations/access-store";
import { isTerminalAttempt, pollDelayMs } from "../payments/online";
import { useSession } from "../auth/use-session";
import { usePaymentCapabilities } from "./payment-capabilities";
import { getPaymentStatus, toPaymentStatusView, type PayerAccess, type PaymentStatusView } from "./online-payments";
import { ApiError } from "./http";
import { useApiResource } from "./use-resource";

/**
 * Which currencies the backend offers for online payment (HTG is only listed if the merchant account can really process it). A failure or "off" both mean
 * "no online option": the reservation and pay-at-pickup never depend on this call.
 */
export function usePaymentOptions() {
  const { currencies, loading, online } = usePaymentCapabilities();
  return { currencies, loading, online };
}

/** How this visitor proves the reservation: the phone typed in this tab (guest) or the signed-in owner. Null = neither (ask for the phone). */
export function usePayerAccess(reference: string, preferOwner = false): PayerAccess | null {
  const { session } = useSession();
  const phone = typeof window === "undefined" ? undefined : recallAccess(reference);
  if (preferOwner && session) return { kind: "owner" };
  if (phone) return { kind: "guest", phone };
  return session ? { kind: "owner" } : null;
}

/**
 * The REAL payment state from the backend, re-asked gently while an attempt is still open (2 s, 4 s, 8 s, then every 15 s, about two minutes) and never again once it
 * is terminal. Arriving from Stripe proves nothing; only this answer does. `stopped` = the schedule ran out while still undecided (show "check again").
 */
export function usePaymentStatus(reference: string, access: PayerAccess | null, attemptId?: string) {
  const key = access ? `pay-status:${reference}:${attemptId ?? ""}:${access.kind}:${access.kind === "guest" ? access.phone : ""}` : null;
  const res = useApiResource<PaymentStatusView>(key, async (signal) => {
    if (!access) throw new ApiError({ status: 0, code: "invalid_response" });
    const view = toPaymentStatusView(await getPaymentStatus(reference, access, attemptId, { signal }));
    if (!view) throw new ApiError({ status: 200, code: "invalid_response" }); // an answer we cannot show truthfully is an error, never made-up figures
    return view;
  });
  const [polls, setPolls] = useState(0);
  const current = res.data ? (res.data.attempt ?? res.data.attempts[0] ?? null) : null;
  const open = !!current && !isTerminalAttempt(current.status);
  const delay = open ? pollDelayMs(polls) : null;
  const { reload, loading } = res;
  useEffect(() => {
    if (!open || loading || delay === null) return;
    const id = window.setTimeout(() => { setPolls((n) => n + 1); reload(); }, delay);
    return () => window.clearTimeout(id);
  }, [open, loading, delay, reload]);
  const checkAgain = useCallback(() => { setPolls(0); reload(); }, [reload]);
  return { ...res, view: res.data ?? null, current, open, stopped: open && !loading && delay === null, checkAgain };
}
