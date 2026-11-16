import { type Money, sumByCurrency } from "../money";
import { balances } from "../reservations/workflow";
import type { PaymentRecord, Reservation, ReservationStatus } from "../reservations/types";

/**
 * Finance figures for the administration. Rules that must never be broken:
 *  - every figure is a list of per-currency amounts (HTG and USD apart); there is no grand total and no conversion;
 *  - "payments received" is the ONLY thing that counts as money in. Reservation value (what was reserved), outstanding
 *    balances (what is still to be paid at pickup) and collected value are different measures and are labelled as such;
 *  - a reservation that was never collected is never revenue.
 */
export interface Period {
  /** Inclusive ISO date (YYYY-MM-DD) or empty for "from the beginning". */
  from?: string;
  to?: string;
}

const dayOf = (iso: string) => iso.slice(0, 10);
const inPeriod = (iso: string, p: Period) => (!p.from || dayOf(iso) >= p.from) && (!p.to || dayOf(iso) <= p.to);

/** Payment records received in the period (each keeps the currency it was received in). */
export function paymentsIn(reservations: readonly Reservation[], period: Period = {}): (PaymentRecord & { reservationId: string; reference: string })[] {
  return reservations.flatMap((r) => r.payment.records.filter((p) => inPeriod(p.receivedAt, period)).map((p) => ({ ...p, reservationId: r.id, reference: r.reference })));
}

export function paymentsReceived(reservations: readonly Reservation[], period: Period = {}): Money[] {
  return sumByCurrency(paymentsIn(reservations, period).map((p) => ({ amount: p.amount, currency: p.currency })));
}

/** What the reservations in the given statuses are worth (per currency), created in the period. NOT revenue. */
export function reservationValue(reservations: readonly Reservation[], statuses: readonly ReservationStatus[], period: Period = {}): Money[] {
  return sumByCurrency(reservations.filter((r) => statuses.includes(r.status) && inPeriod(r.createdAt, period)).flatMap((r) => r.totals));
}

export const countIn = (reservations: readonly Reservation[], statuses: readonly ReservationStatus[], period: Period = {}): number =>
  reservations.filter((r) => statuses.includes(r.status) && inPeriod(r.createdAt, period)).length;

/** Still to be paid at the store on reservations that are READY for pickup (payments are only taken then). */
export function outstandingAtPickup(reservations: readonly Reservation[]): Money[] {
  return sumByCurrency(reservations.filter((r) => r.status === "ready_for_pickup").flatMap((r) => balances(r).map((b) => ({ amount: b.due, currency: b.currency }))).filter((m) => m.amount > 0));
}

/** One row per reservation with something still due, per currency. */
export function outstandingRows(reservations: readonly Reservation[]): { reservation: Reservation; due: Money[] }[] {
  return reservations
    .filter((r) => r.status === "ready_for_pickup")
    .map((reservation) => ({ reservation, due: balances(reservation).filter((b) => b.due > 0).map((b) => ({ amount: b.due, currency: b.currency })) }))
    .filter((x) => x.due.length > 0);
}

/** Value of reservations that were actually collected (handed over), per currency. */
export const collectedValue = (reservations: readonly Reservation[], period: Period = {}): Money[] => reservationValue(reservations, ["collected"], period);

/** Reservation value that is open (pending, confirmed, ready): promised, not yet collected and not revenue. */
export const openValue = (reservations: readonly Reservation[], period: Period = {}): Money[] => reservationValue(reservations, ["pending_review", "confirmed", "ready_for_pickup"], period);
