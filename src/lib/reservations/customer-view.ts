import type { Locale } from "@/i18n/config";
import type { Money } from "../money";
import type { PickupInstructions, PickupLocation } from "../pickup/types";
import { customerCanCancel, paidTotals } from "./workflow";
import type { EventType, PaymentStatus, RejectReason, Reservation, ReservationLine, ReservationStatus } from "./types";

/**
 * What a customer is allowed to see. This is a SEPARATE TYPE from `Reservation` on purpose:
 * internal notes, staff names and payment staff details cannot be expressed here, so a
 * customer-facing screen cannot render them by accident. The real API must return this shape.
 */
export interface CustomerEvent {
  id: string;
  type: EventType;
  at: string;
  /** Message written for the customer. */
  note?: string;
  amount?: Money;
  /** For pickup_changed: the new location. */
  newLocation?: PickupLocation;
  cancelledBy?: "customer" | "store";
  rejectReason?: RejectReason;
}

export interface CustomerReservation {
  reference: string;
  createdAt: string;
  locale: Locale;
  status: ReservationStatus;
  customer: { name: string; phone: string; email?: string };
  lines: ReservationLine[];
  /** One total per currency; never merged. */
  totals: Money[];
  payment: { status: PaymentStatus; paid: Money[] };
  pickup: { location: PickupLocation; instructions: PickupInstructions };
  expiresAt?: string;
  canCancel: boolean;
  events: CustomerEvent[];
}

export function toCustomerView(r: Reservation): CustomerReservation {
  const events: CustomerEvent[] = [];
  for (const e of r.events) {
    // A note-only internal event is invisible to customers.
    if (e.type === "note_added" && !e.customerNote) continue;
    // Payment events show the amount, never who recorded it or any internal note.
    events.push({
      id: e.id,
      type: e.type,
      at: e.at,
      note: e.customerNote,
      amount: e.type === "payment_recorded" ? e.detail?.amount : undefined,
      newLocation: e.type === "pickup_changed" ? e.detail?.toPickup : undefined,
      cancelledBy: e.type === "cancelled" ? (e.detail?.cancelledBy === "customer" ? "customer" : "store") : undefined,
      rejectReason: e.type === "rejected" ? e.detail?.rejectReason : undefined,
    });
  }
  return {
    reference: r.reference,
    createdAt: r.createdAt,
    locale: r.locale,
    status: r.status,
    customer: { name: `${r.customer.firstName} ${r.customer.lastName}`.trim(), phone: `${r.customer.dialCode} ${r.customer.phone}`, email: r.customer.email },
    lines: r.lines,
    totals: r.totals,
    payment: { status: r.payment.status, paid: paidTotals(r) },
    pickup: { location: r.pickup.location, instructions: r.pickup.instructions },
    expiresAt: r.expiresAt,
    canCancel: customerCanCancel(r),
    events,
  };
}
