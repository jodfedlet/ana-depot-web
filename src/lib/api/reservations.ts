/**
 * Reservation & pickup API boundary (DEMO IMPLEMENTATION).
 *
 * Screens never mutate state directly: they call these async functions, which validate through
 * the workflow engine and return `Result`s, exactly like the Spring Boot API will. Today the
 * "database" is localStorage (src/lib/stores) — nothing is persisted or sent anywhere. Replace
 * the bodies with HTTP calls; the signatures and error codes are the contract.
 */
import type { Locale } from "@/i18n/config";
import { type PickupChange, type PickupSettings, pickupAvailability, snapshotFromSettings } from "../pickup/types";
import { changedGroups, validatePickupSettings } from "../pickup/validate";
import { type CustomerReservation, toCustomerView } from "../reservations/customer-view";
import { generateReference, normalizeReference, phoneMatches } from "../reservations/access";
import type { Actor, Reservation, ReservationCustomer, ReservationLine } from "../reservations/types";
import { type Action, type ActionError, applyAction, computeTotals } from "../reservations/workflow";
import { seedCatalog, catalogStore } from "../stores/catalog-store";
import { stockOf } from "../catalog/stock";
import { hasVariantsRecord, pricingIn } from "../catalog/model";
import type { CurrencyCode } from "../money";
import { sampleReservations } from "../mock/reservations";
import { samplePickupHistory, samplePickupSettings } from "../mock/pickup";
import { pickupStore } from "../stores/pickup-store";
import { rememberReference } from "../stores/guest-refs-store";
import { reservationStore } from "../stores/reservation-store";
import { isBlank, isValidEmail, isValidPhone } from "../validation";

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

export interface SubmitReservationInput {
  lines: ReservationLine[];
  customer: ReservationCustomer;
  locale: Locale;
  /** The customer ticked "I understand this is a reservation, not a payment". */
  acknowledgedTerms: boolean;
}

export async function submitReservation(input: SubmitReservationInput): Promise<Result<{ reference: string }>> {
  await latency();
  // The server (not the form) decides whether a reservation may be created.
  const { settings } = pickupStore.getSnapshot();
  const availability = pickupAvailability(settings);
  if (availability === "disabled") return { ok: false, error: "pickup_disabled" };
  if (availability === "not_configured") return { ok: false, error: "pickup_not_configured" };
  if (input.lines.length === 0) return { ok: false, error: "cart_empty" };
  if (!input.acknowledgedTerms) return { ok: false, error: "terms_not_accepted" };
  // Stock rules (frontend demonstration of what the API must enforce): only active products, minimum order, and no overselling.
  const reservations = reservationStore.getSnapshot();
  const catalog = catalogStore.getSnapshot();
  // Stock is ONE position per product/variant shared by every currency: demand is summed across lines (HTG + USD lines of the same item add up).
  const demand = new Map<string, number>();
  for (const l of input.lines) demand.set(`${l.productId}:${l.variantId ?? ""}`, (demand.get(`${l.productId}:${l.variantId ?? ""}`) ?? 0) + l.quantity);
  for (const l of input.lines) {
    const rec = catalog.products.find((p) => p.id === l.productId);
    if (!rec || rec.status !== "active") return { ok: false, error: "product_unavailable", detail: l.name };
    // The line must be priced in a currency the product is sold in, with THAT currency's minimum order. Never converted.
    const pricing = pricingIn(rec, l.unitPrice.currency as CurrencyCode);
    if (!pricing) return { ok: false, error: "currency_mismatch", detail: l.name };
    if (l.quantity < Math.max(1, pricing.minOrderQty ?? 1)) return { ok: false, error: "below_minimum", detail: l.name };
    if (rec.inventory.tracked && (demand.get(`${l.productId}:${l.variantId ?? ""}`) ?? l.quantity) > stockOf(rec, reservations, hasVariantsRecord(rec) ? l.variantId : undefined).available) return { ok: false, error: "insufficient_stock", detail: l.name };
    if (!rec.inventory.tracked && rec.inventory.manualAvailability === "out_of_stock") return { ok: false, error: "product_unavailable", detail: l.name };
  }
  const c = input.customer;
  if (isBlank(c.firstName) || isBlank(c.lastName) || !isValidPhone(c.phone) || (c.email && !isValidEmail(c.email))) {
    return { ok: false, error: "contact_invalid" };
  }

  const existing = new Set(reservationStore.getSnapshot().map((r) => r.reference));
  let reference = generateReference();
  while (existing.has(reference)) reference = generateReference();

  const now = nowIso();
  const id = `res-${Date.now().toString(36)}`;
  const reservation: Reservation = {
    id,
    reference,
    locale: input.locale,
    createdAt: now,
    status: "pending_review", // never accepted, paid or ready on submission
    customer: { ...c, email: c.email?.trim() || undefined },
    lines: input.lines,
    totals: computeTotals(input.lines),
    payment: { method: "cash_at_pickup", status: "unpaid", records: [] },
    pickup: snapshotFromSettings(settings, now), // snapshot: later settings changes never alter it
    events: [{ id: `${id}-e1`, type: "submitted", at: now, actor: { kind: "customer" } }],
  };
  reservationStore.set((prev) => [reservation, ...prev]);
  rememberReference(reference);
  return { ok: true, data: { reference } };
}

/** Guest lookup: reference AND phone must match. The error is identical for "not found" and "wrong phone". */
export async function lookupReservation(referenceInput: string, phoneInput: string): Promise<Result<CustomerReservation>> {
  await latency();
  const ref = normalizeReference(referenceInput);
  const found = reservationStore.getSnapshot().find((r) => r.reference === ref);
  if (!found || !phoneMatches(found, phoneInput)) return { ok: false, error: "verification_failed" };
  rememberReference(found.reference);
  return { ok: true, data: toCustomerView(found) };
}

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
