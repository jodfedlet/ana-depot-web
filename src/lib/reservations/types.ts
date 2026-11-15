import type { Locale } from "@/i18n/config";
import type { UnitId } from "../catalog/model";
import type { PriceKind } from "../catalog/pricing";
import type { Money } from "../money";
import type { PickupLocation, PickupSnapshot } from "../pickup/types";

export const reservationStatuses = [
  "pending_review",
  "confirmed",
  "ready_for_pickup",
  "collected",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type ReservationStatus = (typeof reservationStatuses)[number];

export const openStatuses: ReservationStatus[] = ["pending_review", "confirmed", "ready_for_pickup"];
export const isOpen = (s: ReservationStatus) => openStatuses.includes(s);

export type PaymentStatus = "unpaid" | "partial" | "paid";
/** Only cash at pickup is operational. MonCash / NatCash are "coming soon" and never stored on a reservation. */
export type PaymentMethodId = "cash_at_pickup";

export type Actor = { kind: "customer" } | { kind: "staff"; name: string } | { kind: "system" };

export type RejectReason = "product_unavailable" | "incorrect_product_info" | "quantity_unavailable" | "cannot_fulfill" | "other";
export const rejectReasons: RejectReason[] = ["product_unavailable", "incorrect_product_info", "quantity_unavailable", "cannot_fulfill", "other"];

export type EventType =
  | "submitted"
  | "accepted"
  | "rejected"
  | "ready_for_pickup"
  | "payment_recorded"
  | "collected"
  | "cancelled"
  | "expired"
  | "note_added"
  | "pickup_changed";

export interface EventDetail {
  rejectReason?: RejectReason;
  cancelledBy?: "customer" | "staff";
  cancelReason?: string;
  amount?: Money;
  paymentStatus?: PaymentStatus;
  fromPickup?: PickupLocation;
  toPickup?: PickupLocation;
}

export interface ReservationEvent {
  id: string;
  type: EventType;
  at: string;
  actor: Actor;
  /** Written FOR the customer. Visible in customer views. */
  customerNote?: string;
  /** Staff only. Must never reach a customer-facing view. */
  internalNote?: string;
  detail?: EventDetail;
}

export interface ReservationLine {
  productId: string;
  /** Set when the product has variants; needed to reserve the right stock. */
  variantId?: string;
  slug: string;
  name: string;
  variantLabel?: string;
  quantity: number;
  unitPrice: Money;
  /** Selling unit and which price applied when the reservation was made. */
  unit?: UnitId;
  priceKind?: PriceKind;
  /** Minimum quantity of the wholesale tier that produced `unitPrice` (absent for retail/sale prices). */
  tierMinQty?: number;
  image: { src: string; alt: string };
}

export interface ReservationCustomer {
  firstName: string;
  lastName: string;
  dialCode: string;
  /** National number as typed. */
  phone: string;
  email?: string;
}

export interface PaymentRecord {
  id: string;
  amount: number; // minor units
  currency: string;
  method: PaymentMethodId;
  receivedAt: string;
  recordedAt: string;
  staff: string;
  reference?: string;
  internalNote?: string;
}

export interface Reservation {
  id: string;
  /** Customer-facing reference. Not a secret: viewing requires verification. */
  reference: string;
  /** Language the customer used; admin-authored notes should be written in it. */
  locale: Locale;
  createdAt: string;
  status: ReservationStatus;
  customer: ReservationCustomer;
  lines: ReservationLine[];
  /** One total per currency, never converted or merged (see `sumByCurrency`). A single-currency reservation has one entry. */
  totals: Money[];
  payment: { method: PaymentMethodId; status: PaymentStatus; records: PaymentRecord[] };
  pickup: PickupSnapshot;
  readyAt?: string;
  /** Set only when a hold period is configured (never a hardcoded default). */
  expiresAt?: string;
  events: ReservationEvent[];
  /** True for seeded demonstration records. */
  isSample?: boolean;
}

/** Line total, always in the line's own currency. Derived from the snapshotted unit price and quantity, so later catalog changes cannot alter it. */
export const reservationLineTotal = (l: ReservationLine): Money => ({ amount: l.unitPrice.amount * l.quantity, currency: l.unitPrice.currency });
export const customerFullName = (c: ReservationCustomer) => `${c.firstName} ${c.lastName}`.trim();
export const reservationItemCount = (r: Reservation) => r.lines.reduce((n, l) => n + l.quantity, 0);
