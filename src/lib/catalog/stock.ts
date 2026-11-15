import type { Availability } from "../catalog-types";
import { isOpen, type Reservation } from "../reservations/types";
import { type ProductRecord, hasVariantsRecord } from "./model";

export interface StockInfo {
  tracked: boolean;
  onHand: number;
  reserved: number;
  /** onHand − reserved (never below 0). */
  available: number;
}

/** Quantity held by OPEN reservations (pending, accepted, ready). Collected ones were already deducted; rejected/cancelled/expired are released. */
export function reservedQty(reservations: Reservation[], productId: string, variantId?: string): number {
  let n = 0;
  for (const r of reservations) {
    if (!isOpen(r.status)) continue;
    for (const l of r.lines) if (l.productId === productId && (variantId === undefined || l.variantId === variantId)) n += l.quantity;
  }
  return n;
}

export function stockOf(p: ProductRecord, reservations: Reservation[], variantId?: string): StockInfo {
  const tracked = p.inventory.tracked;
  let onHand: number;
  let reserved: number;
  if (hasVariantsRecord(p)) {
    const vs = variantId ? p.variants.filter((v) => v.id === variantId) : p.variants.filter((v) => v.active);
    onHand = vs.reduce((n, v) => n + v.onHand, 0);
    reserved = variantId ? reservedQty(reservations, p.id, variantId) : reservedQty(reservations, p.id);
  } else {
    onHand = p.inventory.onHand;
    reserved = reservedQty(reservations, p.id);
  }
  return { tracked, onHand, reserved, available: Math.max(0, onHand - reserved) };
}

export type StockState = "ok" | "low" | "out" | "untracked";
export function stockState(p: ProductRecord, info: StockInfo): StockState {
  if (!info.tracked) return p.inventory.manualAvailability === "out_of_stock" ? "out" : "untracked";
  if (info.available <= 0) return "out";
  const t = p.inventory.lowStockThreshold;
  return t !== undefined && info.available <= t ? "low" : "ok";
}

/** Customer-facing availability. Untracked products use the seller's manual setting. */
export function availabilityOf(p: ProductRecord, info: StockInfo): Availability {
  if (!info.tracked) return p.inventory.manualAvailability;
  const s = stockState(p, info);
  return s === "out" ? "out_of_stock" : s === "low" ? "low_stock" : "in_stock";
}
