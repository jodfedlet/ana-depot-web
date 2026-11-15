import { market } from "@/config/market";
import { type Reservation, type ReservationStatus, customerFullName } from "./types";

/** No sort by amount: a reservation can hold several currencies and amounts of different currencies are never compared. */
export type ReservationSort = "newest" | "oldest";
export const reservationSorts: ReservationSort[] = ["newest", "oldest"];

export interface ReservationFilter {
  q?: string;
  status?: ReservationStatus;
  /** Inclusive, "YYYY-MM-DD" in the market time zone. */
  from?: string;
  to?: string;
  sort?: ReservationSort;
  page?: number;
  pageSize?: number;
}

export const ADMIN_PAGE_SIZE = 10;

/** "YYYY-MM-DD" of an instant in the store's time zone (not the browser's), so filters are consistent. */
export function dayKey(iso: string, timeZone: string = market.timeZone): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

const digits = (s: string) => s.replace(/\D/g, "");

export function matchesSearch(r: Reservation, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [r.reference, customerFullName(r.customer), r.customer.email ?? ""].join(" ").toLowerCase();
  if (hay.includes(needle)) return true;
  const d = digits(needle);
  return d.length >= 3 && digits(`${r.customer.dialCode}${r.customer.phone}`).includes(d);
}

export function filterReservations(all: Reservation[], f: ReservationFilter) {
  const pageSize = f.pageSize ?? ADMIN_PAGE_SIZE;
  const filtered = all.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.q && !matchesSearch(r, f.q)) return false;
    const day = dayKey(r.createdAt);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    switch (f.sort) {
      case "oldest": return a.createdAt.localeCompare(b.createdAt);
      default: return b.createdAt.localeCompare(a.createdAt);
    }
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  return { items: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageCount };
}

export function countByStatus(all: Reservation[]): Record<ReservationStatus, number> {
  const counts: Record<ReservationStatus, number> = { pending_review: 0, confirmed: 0, ready_for_pickup: 0, collected: 0, rejected: 0, cancelled: 0, expired: 0 };
  for (const r of all) counts[r.status] += 1;
  return counts;
}
