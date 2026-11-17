/**
 * ADMINISTRATION demo boundary (browser localStorage). The CUSTOMER storefront no longer uses anything here: catalog, pickup, reservations,
 * tracking and accounts talk to the real API (`lib/api/public.ts`). What remains serves the administration screens, which are not connected to
 * the server yet (out of scope of the storefront phase) and say so on screen. Nothing here is persisted or sent anywhere.
 */
import type { PickupChange, PickupSettings } from "../pickup/types";
import { changedGroups, validatePickupSettings } from "../pickup/validate";
import type { Actor, Reservation } from "../reservations/types";
import { type Action, type ActionError, applyAction } from "../reservations/workflow";
import { seedCatalog, catalogStore } from "../stores/catalog-store";
import { sampleReservations } from "../mock/reservations";
import { samplePickupHistory, samplePickupSettings } from "../mock/pickup";
import { pickupStore } from "../stores/pickup-store";
import { reservationStore } from "../stores/reservation-store";

export type ServiceError =
  | ActionError
  | "pickup_disabled"
  | "pickup_not_configured"
  | "cart_empty"
  | "currency_mismatch"
  | "terms_not_accepted"
  | "contact_invalid"
  | "insufficient_stock"
  | "product_unavailable"
  | "below_minimum"
  | "not_found"
  | "verification_failed"
  | "settings_invalid";

export type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError; detail?: string };

const latency = (ms = 450) => new Promise<void>((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

/** Staff or customer action. The caller supplies the actor; the real API derives it from the session. */
export async function runReservationAction(id: string, action: Action, actor: Actor): Promise<Result<Reservation>> {
  await latency(350);
  const current = reservationStore.getSnapshot().find((r) => r.id === id);
  if (!current) return { ok: false, error: "not_found" };
  const result = applyAction(current, action, { now: nowIso(), actor, holdPeriodDays: pickupStore.getSnapshot().settings.holdPeriodDays });
  if (!result.ok) return { ok: false, error: result.error };
  reservationStore.set((prev) => prev.map((r) => (r.id === id ? result.reservation : r)));
  if (action.type === "collect") deductStockForCollection(result.reservation, actor.kind === "staff" ? actor.name : "system");
  return { ok: true, data: result.reservation };
}

/** Handing products over removes them from physical stock (they stop counting as reserved when the status changes). */
function deductStockForCollection(r: Reservation, by: string) {
  const at = nowIso();
  catalogStore.set((state) => {
    const products = state.products.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v })), inventory: { ...p.inventory } }));
    const movements = [...state.movements];
    for (const l of r.lines) {
      const p = products.find((x) => x.id === l.productId);
      if (!p || !p.inventory.tracked) continue;
      const v = l.variantId ? p.variants.find((x) => x.id === l.variantId) : undefined;
      const before = v ? v.onHand : p.inventory.onHand;
      const after = Math.max(0, before - l.quantity);
      if (v) v.onHand = after; else p.inventory.onHand = after;
      movements.push({ id: `mv-${Date.now().toString(36)}-${movements.length}`, productId: p.id, variantId: l.variantId, type: "sale", delta: after - before, balanceAfter: after, reason: "sale", note: r.reference, at, by });
    }
    return { ...state, products, movements };
  });
}

export async function savePickupSettings(next: PickupSettings, staffName: string): Promise<Result<PickupChange | null>> {
  await latency();
  if (Object.keys(validatePickupSettings(next)).length > 0) return { ok: false, error: "settings_invalid" };
  const { settings: before } = pickupStore.getSnapshot();
  const changed = changedGroups(before, next);
  if (changed.length === 0) return { ok: true, data: null };
  const at = nowIso();
  const saved: PickupSettings = { ...next, updatedAt: at, updatedBy: staffName };
  const change: PickupChange = { id: `chg-${Date.now().toString(36)}`, at, by: staffName, before, after: saved, changed };
  // Only the default changes. Existing reservations keep their own snapshot (see submitReservation).
  pickupStore.set((s) => ({ settings: saved, history: [change, ...s.history] }));
  return { ok: true, data: change };
}

/** Demo helper: restore the seeded sample data. */
export function resetDemoData() {
  catalogStore.set(seedCatalog());
  reservationStore.set(sampleReservations);
  pickupStore.set({ settings: samplePickupSettings, history: samplePickupHistory });
}
