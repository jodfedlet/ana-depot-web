import type { Locale } from "@/i18n/config";
import type { UnitId } from "../catalog/model";
import type { PriceKind } from "../catalog/pricing";
import type { Money } from "../money";
import type { PickupInstructions, PickupLocation } from "../pickup/types";
import type { EventType, PaymentStatus, RejectReason, ReservationStatus } from "./types";

/**
 * What a customer sees of a reservation: the shape of the API's `CustomerReservationView` (see `lib/api/map-reservation.ts`).
 * It is a SEPARATE TYPE from the staff `Reservation` on purpose: internal notes, staff names, ledger entries and payment references
 * cannot be expressed here, so a customer-facing screen cannot render them by accident. Every amount comes from the server
 * (nothing here is recomputed from the cart or from local state).
 */
export interface CustomerEvent {
  id: string;
  type: EventType;
  at: string;
  /** Message the store marked as visible to the customer. */
  note?: string;
  cancelledBy?: "customer" | "store";
  rejectReason?: RejectReason;
}

export interface CustomerLine {
  productId: string;
  variantId?: string;
  name: string;
  variantLabel?: string;
  quantity: number;
  unit?: UnitId;
  /** The unit price that applied when the reservation was made (a snapshot: later catalog changes never alter it). */
  unitPrice: Money;
  lineTotal: Money;
  priceKind: PriceKind;
  tierMinQty?: number;
}

export interface CustomerBalance { currency: string; total: Money; paid: Money; due: Money }

export interface CustomerReservation {
  id: string;
  reference: string;
  createdAt: string;
  locale: Locale;
  status: ReservationStatus;
  customer: { name: string; phone: string; email?: string };
  lines: CustomerLine[];
  /** One total per currency; never merged. */
  totals: Money[];
  /** One entry per currency present: total, paid and still due. */
  balances: CustomerBalance[];
  payment: { status: PaymentStatus; paid: Money[] };
  /** The pickup information as promised when the reservation was made; null when the snapshot holds no readable location. */
  pickup: { location: PickupLocation; instructions: PickupInstructions } | null;
  readyAt?: string;
  expiresAt?: string;
  canCancel: boolean;
  events: CustomerEvent[];
}
