"use client";

import { useCallback, useMemo } from "react";
import type { CustomerReservation } from "../reservations/customer-view";
import { forgetAccess, recallAccess, rememberAccess } from "../reservations/access-store";
import { ApiError } from "./http";
import { toCustomerReservation } from "./map-reservation";
import { getMyReservation, listMyReservations, lookupReservation } from "./public";
import { useApiResource } from "./use-resource";
import type { ReservationViewDto } from "./dto";

const readable = (dto: ReservationViewDto): CustomerReservation => {
  const view = toCustomerReservation(dto);
  if (!view) throw new ApiError({ status: 200, code: "invalid_response" }); // an answer we cannot show truthfully is an error, never made-up figures
  return view;
};

/** A guest (or the owner) opening one reservation: the server decides what is visible, from the reference + phone or from the signed-in owner's id. */
export type TrackOutcome =
  | { kind: "ready"; view: CustomerReservation }
  | { kind: "needs_phone" };

export function useTrackedReservation(reference: string, mineId?: string) {
  const key = `track:${reference}:${mineId ?? ""}`;
  const { data, loading, error, reload } = useApiResource<TrackOutcome>(key, async (signal) => {
    if (mineId) return { kind: "ready", view: readable(await getMyReservation(mineId, { signal })) }; // 404 = not theirs / not found; 401 = session problem
    const phone = recallAccess(reference);
    if (!phone) return { kind: "needs_phone" };
    try {
      return { kind: "ready", view: readable(await lookupReservation(reference, phone, { signal })) };
    } catch (e) {
      // wrong credentials (or an unknown reference — the API answers both identically): forget them and ask again, revealing nothing
      if (e instanceof ApiError && e.problem.status === 404) { forgetAccess(reference); return { kind: "needs_phone" }; }
      throw e;
    }
  });

  /** Verify with a typed phone. Resolves with the ApiError when it does not match (the same error whether or not the reference exists). */
  const verify = useCallback(async (phone: string): Promise<ApiError | null> => {
    try {
      readable(await lookupReservation(reference, phone));
    } catch (e) {
      return e instanceof ApiError ? e : new ApiError({ status: 0, code: "network_error" });
    }
    rememberAccess(reference, phone);
    reload();
    return null;
  }, [reference, reload]);

  return { outcome: data, loading, error, reload, verify };
}

/** One page of the signed-in customer's own reservations (newest first). The server only ever returns the token owner's. */
export function useMyReservations(page: number, size: number) {
  const { data, loading, error, reload } = useApiResource(`mine:${page}:${size}`, (signal) => listMyReservations(page, size, { signal }));
  const items = useMemo(() => (data?.items ?? []).map((d) => toCustomerReservation(d)).filter((v): v is CustomerReservation => v !== null), [data]);
  return { items, totalPages: data?.totalPages ?? 0, totalItems: data?.totalItems ?? 0, loading, error, reload };
}
