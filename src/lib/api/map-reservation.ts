import type { Locale } from "@/i18n/config";
import { isLocale } from "@/i18n/config";
import { type UnitId, unitIds } from "../catalog/model";
import type { PriceKind } from "../catalog/pricing";
import type { LText } from "../localized";
import type { Money } from "../money";
import type { DayNumber, PickupInstructions, PickupLocation } from "../pickup/types";
import type { CustomerBalance, CustomerEvent, CustomerLine, CustomerReservation } from "../reservations/customer-view";
import { type EventType, type PaymentStatus, type RejectReason, type ReservationStatus, rejectReasons, reservationStatuses } from "../reservations/types";
import { decimalToMinor } from "./decimal";
import type { LTextDto, PickupDto, PickupInstructionsDto, PickupLocationDto, ReservationViewDto } from "./dto";

const lt = (t: LTextDto | null | undefined): LText => ({ fr: t?.fr ?? "", ht: t?.ht ?? "" });

/** Pickup location as the screens need it. Missing text becomes empty (screens hide empty blocks); nothing is invented. */
export function toPickupLocation(l: PickupLocationDto): PickupLocation {
  return {
    storeName: l.storeName ?? "",
    addressLine: l.addressLine ?? "",
    city: l.city ?? "",
    region: l.region ?? "",
    country: l.country ?? "",
    postalCode: l.postalCode ?? undefined,
    phone: l.phone ?? "",
    email: l.email ?? undefined,
    additionalLocationInfo: lt(l.additionalLocationInfo),
    schedule: (l.schedule ?? []).filter((d) => Number.isInteger(d.day) && d.day >= 1 && d.day <= 7).map((d) => ({ day: d.day as DayNumber, open: d.open, from: d.from, to: d.to })),
    closureInfo: lt(l.closureInfo),
  };
}
export function toPickupInstructions(i: PickupInstructionsDto | null | undefined): PickupInstructions {
  return { general: lt(i?.general), contact: lt(i?.contact), accepted: lt(i?.accepted), ready: lt(i?.ready), policy: lt(i?.policy) };
}

export type PickupView =
  | { status: "available"; location: PickupLocation; instructions: PickupInstructions }
  | { status: "disabled"; message: LText }
  | { status: "not_configured" };

/** `GET /store/pickup`. An `available` answer without a location is treated as not configured: never show a half-empty address. */
export function toPickupView(dto: PickupDto): PickupView {
  if (dto.status === "available" && dto.location) return { status: "available", location: toPickupLocation(dto.location), instructions: toPickupInstructions(dto.instructions) };
  if (dto.status === "disabled") return { status: "disabled", message: lt(dto.unavailableMessage) };
  return { status: "not_configured" };
}

const STATUS = (s: string): ReservationStatus | null => {
  const v = s.toLowerCase();
  return (reservationStatuses as readonly string[]).includes(v) ? (v as ReservationStatus) : null;
};
const PAYMENT: Record<string, PaymentStatus> = { UNPAID: "unpaid", PARTIAL: "partial", PAID: "paid" };
const EVENT: Record<string, EventType> = { SUBMITTED: "submitted", ACCEPTED: "accepted", REJECTED: "rejected", READY_FOR_PICKUP: "ready_for_pickup", COLLECTED: "collected", CANCELLED: "cancelled", EXPIRED: "expired", NOTE: "note_added" };
const PRICE_KIND: Record<string, PriceKind> = { RETAIL: "retail", SALE: "sale", WHOLESALE: "wholesale" };

const amount = (value: string, currency: string): Money | null => {
  const minor = decimalToMinor(value, currency);
  return minor === null ? null : { amount: minor, currency };
};

/**
 * `CustomerReservationView` -> the customer view model. Returns null when the response is not something the screen can show truthfully
 * (unknown status, unreadable money): a malformed answer is an error, never a reservation with made-up figures.
 */
export function toCustomerReservation(dto: ReservationViewDto): CustomerReservation | null {
  const status = STATUS(dto.status);
  const paymentStatus = PAYMENT[dto.paymentStatus];
  if (!status || !paymentStatus) return null;

  const lines: CustomerLine[] = [];
  for (const l of dto.lines) {
    const unitPrice = amount(l.unitPrice, l.currency);
    const lineTotal = amount(l.lineTotal, l.currency);
    if (!unitPrice || !lineTotal) return null;
    const unit = l.unit.toLowerCase();
    lines.push({
      productId: l.productId,
      variantId: l.variantId ?? undefined,
      name: l.name,
      variantLabel: l.variantLabel ?? undefined,
      quantity: l.quantity,
      unit: (unitIds as readonly string[]).includes(unit) ? (unit as UnitId) : undefined,
      unitPrice,
      lineTotal,
      priceKind: PRICE_KIND[l.pricingKind] ?? "retail",
      tierMinQty: l.tierMinQuantity ?? undefined,
    });
  }

  const totals: Money[] = [];
  for (const t of dto.totals) {
    const m = amount(t.amount, t.currency);
    if (!m) return null;
    totals.push(m);
  }
  const balances: CustomerBalance[] = [];
  for (const b of dto.balances) {
    const total = amount(b.total, b.currency);
    const paid = amount(b.paid, b.currency);
    const due = amount(b.due, b.currency);
    if (!total || !paid || !due) return null;
    balances.push({ currency: b.currency, total, paid, due });
  }

  const events: CustomerEvent[] = dto.events.flatMap((e, i) => {
    const type = EVENT[e.type];
    if (!type) return []; // an event kind this client does not know is left out rather than mislabelled
    const reason = e.rejectReason?.toLowerCase();
    return [{
      id: `${e.type}-${e.at}-${i}`,
      type,
      at: e.at,
      note: e.note ?? undefined,
      cancelledBy: e.type === "CANCELLED" ? (e.cancelledBy === "CUSTOMER" ? ("customer" as const) : ("store" as const)) : undefined,
      rejectReason: reason && (rejectReasons as string[]).includes(reason) ? (reason as RejectReason) : undefined,
    }];
  });

  const c = dto.contact;
  const location = dto.pickup?.location;
  return {
    id: dto.id,
    reference: dto.reference,
    createdAt: dto.createdAt,
    locale: isLocale(dto.locale) ? (dto.locale as Locale) : "fr",
    status,
    customer: { name: `${c.firstName} ${c.lastName}`.trim(), phone: `${c.dialCode} ${c.phone}`.trim(), email: c.email ?? undefined },
    lines,
    totals,
    balances,
    payment: { status: paymentStatus, paid: balances.map((b) => b.paid).filter((p) => p.amount > 0) },
    pickup: location && location.storeName ? { location: toPickupLocation(location), instructions: toPickupInstructions(dto.pickup?.instructions) } : null,
    readyAt: dto.readyAt ?? undefined,
    expiresAt: dto.expiresAt ?? undefined,
    canCancel: dto.canCancel === true,
    events,
  };
}
