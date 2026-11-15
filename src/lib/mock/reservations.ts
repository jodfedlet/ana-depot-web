/**
 * SAMPLE DATA — fictional reservations that demonstrate every status and the audit trail.
 * Names, phones and emails are fake. Dates are fixed so output is deterministic.
 */
import type { Locale } from "@/i18n/config";
import { seedCategories, seedProducts } from "./catalog-seed";
import { toProduct } from "../catalog/localize";
import { snapshotFor, unitPriceFor } from "../catalog/pricing";
import { previousSampleLocation, sampleInstructions, sampleLocation } from "./pickup";
import { noteTemplates } from "../reservations/templates";
import { pick } from "../localized";
import type { PickupSnapshot } from "../pickup/types";
import type { Actor, PaymentRecord, Reservation, ReservationEvent, ReservationLine } from "../reservations/types";
import { computeTotals } from "../reservations/workflow";

const STAFF: Actor = { kind: "staff", name: "Personnel exemple" };
const CUSTOMER: Actor = { kind: "customer" };
const SYSTEM: Actor = { kind: "system" };

const currentSnapshot = (at: string): PickupSnapshot => ({ location: sampleLocation, instructions: sampleInstructions, capturedAt: at, origin: "default" });
const oldSnapshot = (at: string): PickupSnapshot => ({ location: previousSampleLocation, instructions: sampleInstructions, capturedAt: at, origin: "default" });

/** Builds a reservation line exactly as the storefront would: variant, tier price and unit snapshot. */
function line(slug: string, quantity: number, locale: Locale, variantIds?: Record<string, string>): ReservationLine {
  const rec = seedProducts.find((x) => x.slug === slug)!;
  const display = toProduct(rec, seedCategories.find((c) => c.slug === rec.categorySlug), locale, []);
  const variant = variantIds ? rec.variants.find((v) => Object.entries(variantIds).every(([k, id]) => v.optionValues[k] === id)) : undefined;
  const shown = variant ? display.variants.find((v) => v.id === variant.id) : undefined;
  const price = unitPriceFor(snapshotFor(rec.pricing, variant?.price), quantity);
  return {
    productId: rec.id,
    variantId: variant?.id,
    slug,
    name: display.name,
    variantLabel: shown ? Object.entries(shown.optionValues).map(([k, v]) => `${k} : ${v}`).join(" · ") : undefined,
    quantity,
    unitPrice: { amount: price.unitPrice, currency: rec.pricing.currency },
    unit: rec.unit,
    priceKind: price.kind,
    tierMinQty: price.tier?.minQty,
    image: display.images[shown?.imageIndex ?? 0],
  };
}

let seq = 0;
const ev = (res: string, type: ReservationEvent["type"], at: string, actor: Actor, extra: Partial<ReservationEvent> = {}): ReservationEvent => ({
  id: `${res}-e${++seq}`,
  type,
  at,
  actor,
  ...extra,
});

function make(base: Omit<Reservation, "totals" | "payment" | "isSample"> & { payment?: Reservation["payment"] }): Reservation {
  return {
    ...base,
    totals: computeTotals(base.lines),
    payment: base.payment ?? { method: "cash_at_pickup", status: "unpaid", records: [] },
    isSample: true,
  };
}

const RES6_LINES: ReservationLine[] = [line("sandales-cuir", 1, "fr", { size: "s41" }), line("casserole-set", 1, "fr")];
/** One cash payment per currency of the reservation, each for the exact amount owed in that currency. */
function paidInFull(id: string, lines: ReservationLine[], receivedAt: string, recordedAt: string): PaymentRecord[] {
  return computeTotals(lines).map((t, i) => ({ id: `${id}-p${i + 1}`, amount: t.amount, currency: t.currency, method: "cash_at_pickup", receivedAt, recordedAt, staff: "Personnel exemple", internalNote: "Montant exact." }));
}

const alex = { firstName: "Alex", lastName: "Sample", dialCode: "+509", phone: "0000 0101", email: "alex.sample@example.com" };

export const sampleReservations: Reservation[] = [
  make({
    id: "res-1", reference: "ANA-PEND01", locale: "fr", createdAt: "2026-11-14T15:20:00Z", status: "pending_review", customer: alex,
    lines: [line("baskets-sport", 6, "fr", { size: "s42", color: "black" }), line("chaise-empilable", 10, "fr")], pickup: currentSnapshot("2026-11-14T15:20:00Z"),
    events: [ev("res-1", "submitted", "2026-11-14T15:20:00Z", CUSTOMER)],
  }),
  make({
    id: "res-2", reference: "ANA-PEND02", locale: "ht", createdAt: "2026-11-14T09:05:00Z", status: "pending_review",
    customer: { firstName: "Marie", lastName: "Exemple", dialCode: "+509", phone: "0000 0202" },
    lines: [line("corde-nylon", 10, "ht"), line("drap-coton-set", 1, "ht", { size: "double" })], pickup: currentSnapshot("2026-11-14T09:05:00Z"),
    events: [ev("res-2", "submitted", "2026-11-14T09:05:00Z", CUSTOMER)],
  }),
  make({
    id: "res-3", reference: "ANA-CONF01", locale: "fr", createdAt: "2026-11-12T11:40:00Z", status: "confirmed",
    customer: { firstName: "Jean", lastName: "Exemple", dialCode: "+509", phone: "0000 0303", email: "jean@example.com" },
    lines: [line("matelas-mousse", 2, "fr", { size: "double" })], pickup: currentSnapshot("2026-11-12T11:40:00Z"),
    events: [
      ev("res-3", "submitted", "2026-11-12T11:40:00Z", CUSTOMER),
      ev("res-3", "accepted", "2026-11-12T14:10:00Z", STAFF, { customerNote: pick(noteTemplates.accept, "fr"), internalNote: "Stock vérifié en rayon." }),
    ],
  }),
  make({
    id: "res-4", reference: "ANA-READY1", locale: "ht", createdAt: "2026-11-02T08:30:00Z", status: "ready_for_pickup", customer: alex,
    lines: [line("table-a-manger", 1, "ht", { size: "p4" })], pickup: oldSnapshot("2026-11-02T08:30:00Z"), readyAt: "2026-11-03T16:00:00Z",
    events: [
      ev("res-4", "submitted", "2026-11-02T08:30:00Z", CUSTOMER),
      ev("res-4", "accepted", "2026-11-02T10:00:00Z", STAFF, { customerNote: pick(noteTemplates.accept, "ht") }),
      ev("res-4", "ready_for_pickup", "2026-11-03T16:00:00Z", STAFF, { customerNote: pick(noteTemplates.ready, "ht"), internalNote: "Emballé et rangé derrière le comptoir." }),
    ],
  }),
  make({
    id: "res-5", reference: "ANA-READY2", locale: "fr", createdAt: "2026-11-07T13:15:00Z", status: "ready_for_pickup",
    customer: { firstName: "Sophie", lastName: "Exemple", dialCode: "+509", phone: "0000 0808", email: "sophie@example.com" },
    lines: [line("tube-rond-galva", 12, "fr", { diameter: "d32" }), line("boite-vis", 2, "fr")], readyAt: "2026-11-08T09:00:00Z",
    pickup: { location: sampleLocation, instructions: sampleInstructions, capturedAt: "2026-11-08T09:30:00Z", origin: "override" },
    events: [
      ev("res-5", "submitted", "2026-11-07T13:15:00Z", CUSTOMER),
      ev("res-5", "accepted", "2026-11-07T15:00:00Z", STAFF, { customerNote: pick(noteTemplates.accept, "fr") }),
      ev("res-5", "ready_for_pickup", "2026-11-08T09:00:00Z", STAFF, { customerNote: pick(noteTemplates.ready, "fr") }),
      ev("res-5", "pickup_changed", "2026-11-08T09:30:00Z", STAFF, {
        customerNote: pick(noteTemplates.pickupChanged, "fr"),
        internalNote: "Client prévenu par téléphone.",
        detail: { fromPickup: previousSampleLocation, toPickup: sampleLocation },
      }),
    ],
  }),
  make({
    id: "res-6", reference: "ANA-COLL01", locale: "fr", createdAt: "2026-10-28T10:00:00Z", status: "collected",
    customer: { firstName: "Paul", lastName: "Exemple", dialCode: "+509", phone: "0000 0404" },
    lines: RES6_LINES, pickup: oldSnapshot("2026-10-28T10:00:00Z"), readyAt: "2026-10-29T09:00:00Z",
    // Mixed-currency reservation: each currency is settled in full, in its own currency.
    payment: { method: "cash_at_pickup", status: "paid", records: paidInFull("res-6", RES6_LINES, "2026-10-30T14:30:00Z", "2026-10-30T14:31:00Z") },
    events: [
      ev("res-6", "submitted", "2026-10-28T10:00:00Z", CUSTOMER),
      ev("res-6", "accepted", "2026-10-28T12:00:00Z", STAFF, { customerNote: pick(noteTemplates.accept, "fr") }),
      ev("res-6", "ready_for_pickup", "2026-10-29T09:00:00Z", STAFF, { customerNote: pick(noteTemplates.ready, "fr") }),
      ...paidInFull("res-6", RES6_LINES, "2026-10-30T14:30:00Z", "2026-10-30T14:31:00Z").map((p, i, all) => ev("res-6", "payment_recorded", "2026-10-30T14:31:00Z", STAFF, { internalNote: "Montant exact.", detail: { amount: { amount: p.amount, currency: p.currency }, paymentStatus: i === all.length - 1 ? "paid" : "partial" } })),
      ev("res-6", "collected", "2026-10-30T14:35:00Z", STAFF),
    ],
  }),
  make({
    id: "res-7", reference: "ANA-REJ001", locale: "ht", createdAt: "2026-11-09T17:00:00Z", status: "rejected",
    customer: { firstName: "Rose", lastName: "Exemple", dialCode: "+509", phone: "0000 0505" },
    lines: [line("sandales-cuir", 1, "ht", { size: "s40" })], pickup: currentSnapshot("2026-11-09T17:00:00Z"),
    events: [
      ev("res-7", "submitted", "2026-11-09T17:00:00Z", CUSTOMER),
      ev("res-7", "rejected", "2026-11-10T08:20:00Z", STAFF, {
        customerNote: pick(noteTemplates.rejected.product_unavailable, "ht"),
        internalNote: "Pointure épuisée, réapprovisionnement non prévu.",
        detail: { rejectReason: "product_unavailable" },
      }),
    ],
  }),
  make({
    id: "res-8", reference: "ANA-CANC01", locale: "fr", createdAt: "2026-11-06T12:00:00Z", status: "cancelled",
    customer: { firstName: "Luc", lastName: "Exemple", dialCode: "+509", phone: "0000 0606" },
    lines: [line("corniere-acier", 2, "fr")], pickup: currentSnapshot("2026-11-06T12:00:00Z"),
    events: [
      ev("res-8", "submitted", "2026-11-06T12:00:00Z", CUSTOMER),
      ev("res-8", "cancelled", "2026-11-06T18:30:00Z", CUSTOMER, { detail: { cancelledBy: "customer", cancelReason: "Je n'en ai plus besoin." } }),
    ],
  }),
  make({
    id: "res-9", reference: "ANA-EXP001", locale: "fr", createdAt: "2026-10-20T09:00:00Z", status: "expired",
    customer: { firstName: "Anne", lastName: "Exemple", dialCode: "+509", phone: "0000 0707" },
    lines: [line("fer-a-beton", 20, "fr", { diameter: "d10" })], pickup: oldSnapshot("2026-10-20T09:00:00Z"), readyAt: "2026-10-21T10:00:00Z",
    events: [
      ev("res-9", "submitted", "2026-10-20T09:00:00Z", CUSTOMER),
      ev("res-9", "accepted", "2026-10-20T11:00:00Z", STAFF, { customerNote: pick(noteTemplates.accept, "fr") }),
      ev("res-9", "ready_for_pickup", "2026-10-21T10:00:00Z", STAFF, { customerNote: pick(noteTemplates.ready, "fr") }),
      ev("res-9", "expired", "2026-11-04T08:00:00Z", SYSTEM, { internalNote: "Non retiré dans le délai (exemple)." }),
    ],
  }),
];
