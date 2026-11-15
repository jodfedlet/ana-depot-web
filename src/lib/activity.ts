import type { StockMovement } from "./catalog/model";
import type { EventType, Reservation } from "./reservations/types";

export type ActivityItem =
  | { kind: "reservation"; at: string; reference: string; event: EventType; actor: string }
  | { kind: "stock"; at: string; productId: string; variantId?: string; movement: StockMovement };

/** Most recent things that happened, across reservations and stock. Built from real records, never invented. */
export function recentActivity(reservations: Reservation[], movements: StockMovement[], limit = 8): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const r of reservations) for (const e of r.events) items.push({ kind: "reservation", at: e.at, reference: r.reference, event: e.type, actor: e.actor.kind === "staff" ? e.actor.name : e.actor.kind });
  // The opening balance of an item is setup, not activity.
  for (const m of movements) if (m.type !== "initial") items.push({ kind: "stock", at: m.at, productId: m.productId, variantId: m.variantId, movement: m });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
