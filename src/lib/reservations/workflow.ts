import { type Money, multiplyMoney, sumByCurrency } from "../money";
import type { PickupSnapshot } from "../pickup/types";
import type {
  Actor,
  EventDetail,
  EventType,
  PaymentStatus,
  RejectReason,
  Reservation,
  ReservationEvent,
  ReservationLine,
  ReservationStatus,
} from "./types";

/**
 * Reservation lifecycle rules. Pure functions: no I/O, no clock, no randomness.
 * The real rules will be enforced by the Spring Boot API; this module mirrors them so the
 * frontend demonstration is honest and the UI can disable actions that would be rejected.
 *
 *   pending_review ──accept──▶ confirmed ──markReady──▶ ready_for_pickup ──collect──▶ collected
 *        │ reject ▶ rejected        │                          │  (needs payment = paid)
 *        └──────────── cancel ──────┴──────── cancel/expire ───┘
 */
export type ActionType = "accept" | "reject" | "markReady" | "recordPayment" | "collect" | "cancel" | "expire" | "addNote" | "changePickup";

export type Action =
  | { type: "accept"; customerNote?: string; internalNote?: string }
  | { type: "reject"; reason: RejectReason; customerNote?: string; internalNote?: string }
  | { type: "markReady"; pickupConfirmed: boolean; customerNote?: string; internalNote?: string }
  | { type: "recordPayment"; amount: number; /** ISO code of the payment; must be one of the reservation's currencies. */ currency: string; receivedAt: string; reference?: string; internalNote?: string }
  | { type: "collect"; handoverConfirmed: boolean; internalNote?: string }
  | { type: "cancel"; reason: string; operationalCheck?: boolean; customerNote?: string; internalNote?: string }
  | { type: "expire"; internalNote?: string }
  | { type: "addNote"; visibility: "customer" | "internal"; text: string }
  | { type: "changePickup"; to: PickupSnapshot; customerNote?: string; internalNote?: string };

export type ActionError =
  | "invalid_status"
  | "staff_required"
  | "reason_required"
  | "explanation_required"
  | "pickup_not_confirmed"
  | "amount_invalid"
  | "currency_invalid"
  | "already_paid"
  | "payment_required"
  | "handover_not_confirmed"
  | "operational_check_required"
  | "note_empty"
  | "pickup_invalid";

export type ActionResult = { ok: true; reservation: Reservation } | { ok: false; error: ActionError };

export interface ActionContext {
  now: string; // ISO
  actor: Actor;
  /** From pickup settings; null when the business has not configured an expiration policy. */
  holdPeriodDays: number | null;
}

const STAFF_ACTIONS: Record<ReservationStatus, ActionType[]> = {
  pending_review: ["accept", "reject", "cancel", "addNote", "changePickup"],
  confirmed: ["markReady", "cancel", "expire", "addNote", "changePickup"],
  ready_for_pickup: ["recordPayment", "collect", "cancel", "expire", "addNote", "changePickup"],
  collected: ["addNote"],
  rejected: ["addNote"],
  cancelled: ["addNote"],
  expired: ["addNote"],
};

/** Actions a staff member may attempt in the reservation's current state. */
export function allowedStaffActions(r: Reservation): ActionType[] {
  return STAFF_ACTIONS[r.status].filter((a) => !(a === "recordPayment" && r.payment.status === "paid"));
}

/** A customer may cancel an open reservation until they have paid. */
export function customerCanCancel(r: Reservation): boolean {
  return (r.status === "pending_review" || r.status === "confirmed" || r.status === "ready_for_pickup") && r.payment.status === "unpaid";
}

/** Totals per currency. Different currencies are never added together (and no exchange rate exists). */
export function computeTotals(lines: ReservationLine[]): Money[] {
  return sumByCurrency(lines.map((l) => multiplyMoney(l.unitPrice, l.quantity)));
}

/** Money received, per currency (a payment keeps the currency it was made in). */
export function paidTotals(r: Reservation): Money[] {
  return sumByCurrency(r.payment.records.map((p) => ({ amount: p.amount, currency: p.currency })));
}

export interface Balance { currency: string; total: number; paid: number; due: number }
/** One balance per currency of the reservation: what is owed, what was received in that currency, what remains. */
export function balances(r: Reservation): Balance[] {
  const paid = paidTotals(r);
  return r.totals.map((t) => {
    const p = paid.find((x) => x.currency === t.currency)?.amount ?? 0;
    return { currency: t.currency, total: t.amount, paid: p, due: Math.max(0, t.amount - p) };
  });
}

export function paymentStatusOf(r: Reservation): PaymentStatus {
  const b = balances(r);
  if (b.length > 0 && b.every((x) => x.due === 0)) return "paid";
  return b.some((x) => x.paid > 0) ? "partial" : "unpaid";
}

const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
const clean = (s?: string) => (s && s.trim() ? s.trim() : undefined);

function withEvent(r: Reservation, type: EventType, ctx: ActionContext, extra: Partial<ReservationEvent> = {}): ReservationEvent[] {
  const event: ReservationEvent = { id: `${r.id}-e${r.events.length + 1}`, type, at: ctx.now, actor: ctx.actor, ...extra };
  return [...r.events, event];
}

export function applyAction(r: Reservation, action: Action, ctx: ActionContext): ActionResult {
  const fail = (error: ActionError): ActionResult => ({ ok: false, error });
  const done = (next: Reservation): ActionResult => ({ ok: true, reservation: next });
  const isStaff = ctx.actor.kind === "staff";

  // Customers can only cancel, and only while the rules allow it.
  if (ctx.actor.kind === "customer") {
    if (action.type !== "cancel") return fail("staff_required");
    if (!customerCanCancel(r)) return fail("invalid_status");
    if (!clean(action.reason)) return fail("reason_required");
    const detail: EventDetail = { cancelledBy: "customer", cancelReason: action.reason.trim() };
    return done({ ...r, status: "cancelled", events: withEvent(r, "cancelled", ctx, { detail }) });
  }
  if (!isStaff && ctx.actor.kind !== "system") return fail("staff_required");
  if (ctx.actor.kind === "system" && action.type !== "expire") return fail("staff_required");

  if (!STAFF_ACTIONS[r.status].includes(action.type)) return fail("invalid_status");

  switch (action.type) {
    case "accept":
      return done({
        ...r,
        status: "confirmed",
        events: withEvent(r, "accepted", ctx, { customerNote: clean(action.customerNote), internalNote: clean(action.internalNote) }),
      });

    case "reject": {
      // "Other" has no standard wording, so the customer must get a personalized explanation.
      if (action.reason === "other" && !clean(action.customerNote)) return fail("explanation_required");
      return done({
        ...r,
        status: "rejected",
        events: withEvent(r, "rejected", ctx, {
          customerNote: clean(action.customerNote),
          internalNote: clean(action.internalNote),
          detail: { rejectReason: action.reason },
        }),
      });
    }

    case "markReady": {
      if (!action.pickupConfirmed) return fail("pickup_not_confirmed");
      return done({
        ...r,
        status: "ready_for_pickup",
        readyAt: ctx.now,
        expiresAt: ctx.holdPeriodDays ? addDays(ctx.now, ctx.holdPeriodDays) : undefined,
        events: withEvent(r, "ready_for_pickup", ctx, { customerNote: clean(action.customerNote), internalNote: clean(action.internalNote) }),
      });
    }

    case "recordPayment": {
      if (r.payment.status === "paid") return fail("already_paid");
      if (!Number.isInteger(action.amount) || action.amount <= 0) return fail("amount_invalid");
      // A payment is recorded in the currency it was received in, and only settles that currency's balance.
      const target = balances(r).find((b) => b.currency === action.currency);
      if (!target) return fail("currency_invalid");
      if (target.due === 0) return fail("already_paid");
      const record = {
        id: `${r.id}-p${r.payment.records.length + 1}`,
        amount: action.amount,
        currency: action.currency,
        method: r.payment.method,
        receivedAt: action.receivedAt,
        recordedAt: ctx.now,
        staff: ctx.actor.kind === "staff" ? ctx.actor.name : "system",
        reference: clean(action.reference),
        internalNote: clean(action.internalNote),
      };
      const withPayment: Reservation = { ...r, payment: { ...r.payment, records: [...r.payment.records, record] } };
      const status = paymentStatusOf(withPayment);
      return done({
        ...withPayment,
        payment: { ...withPayment.payment, status },
        events: withEvent(r, "payment_recorded", ctx, {
          internalNote: clean(action.internalNote),
          detail: { amount: { amount: action.amount, currency: action.currency }, paymentStatus: status },
        }),
      });
    }

    case "collect": {
      if (r.payment.status !== "paid") return fail("payment_required");
      if (!action.handoverConfirmed) return fail("handover_not_confirmed");
      return done({ ...r, status: "collected", events: withEvent(r, "collected", ctx, { internalNote: clean(action.internalNote) }) });
    }

    case "cancel": {
      if (!clean(action.reason)) return fail("reason_required");
      // Cancelling something the customer was already promised needs a deliberate operational check.
      if ((r.status === "confirmed" || r.status === "ready_for_pickup") && !action.operationalCheck) return fail("operational_check_required");
      return done({
        ...r,
        status: "cancelled",
        events: withEvent(r, "cancelled", ctx, {
          customerNote: clean(action.customerNote),
          internalNote: clean(action.internalNote),
          detail: { cancelledBy: "staff", cancelReason: action.reason.trim() },
        }),
      });
    }

    case "expire":
      return done({ ...r, status: "expired", events: withEvent(r, "expired", ctx, { internalNote: clean(action.internalNote) }) });

    case "addNote": {
      const text = clean(action.text);
      if (!text) return fail("note_empty");
      return done({
        ...r,
        events: withEvent(r, "note_added", ctx, action.visibility === "customer" ? { customerNote: text } : { internalNote: text }),
      });
    }

    case "changePickup": {
      const l = action.to.location;
      if (!l.storeName.trim() || !l.addressLine.trim() || !l.city.trim() || !l.phone.trim()) return fail("pickup_invalid");
      return done({
        ...r,
        pickup: { ...action.to, capturedAt: ctx.now },
        events: withEvent(r, "pickup_changed", ctx, {
          customerNote: clean(action.customerNote),
          internalNote: clean(action.internalNote),
          detail: { fromPickup: r.pickup.location, toPickup: l },
        }),
      });
    }
  }
}

/** Open reservations past their configured expiration date (staff may mark them expired). */
export function isOverdue(r: Reservation, nowIso: string): boolean {
  return r.status === "ready_for_pickup" && !!r.expiresAt && r.expiresAt < nowIso;
}
