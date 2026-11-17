"use client";

import { useEffect, useState } from "react";
import { listReservations, reportOverview } from "./endpoints";
import type { AdminReservationSummary } from "./dto";
import { useAdminResource } from "./hooks";

const EVENT = "ana:admin-changed";
/** Call after any successful staff write: the sidebar counters and notifications refresh at once instead of waiting for the next poll. */
export const announceAdminChange = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT)); };

const POLL_MS = 60_000;

export interface AdminSignals { pending: number | null; stockAttention: number | null; recent: AdminReservationSummary[]; error: unknown }

/**
 * What the sidebar and the bell show: reservations waiting for review and stock positions that need attention, read from the REPORTING API (server-side
 * counts), never computed from a downloaded dataset. `null` means "unknown" (loading or failed): the UI shows no badge rather than a made-up zero.
 */
export function useAdminSignals(): AdminSignals {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(EVENT, bump);
    const id = window.setInterval(bump, POLL_MS);
    return () => { window.removeEventListener(EVENT, bump); window.clearInterval(id); };
  }, []);
  const res = useAdminResource(`signals:${tick}`, async (signal) => {
    const [overview, pending] = await Promise.all([reportOverview({}, { signal }), listReservations({ status: "PENDING_REVIEW", size: 4, sort: "OLDEST" }, { signal })]);
    return { overview, pending };
  });
  const data = res.data;
  return {
    pending: data ? (data.overview.openNow.PENDING_REVIEW ?? 0) : null,
    stockAttention: data ? data.overview.stock.low + data.overview.stock.out : null,
    recent: data?.pending.items ?? [],
    error: res.error,
  };
}
