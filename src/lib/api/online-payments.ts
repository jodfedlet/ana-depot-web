import { anonymousApiClient } from "./client";
import { decimalToMinor } from "./decimal";
import { ApiError } from "./http";
import { signedInClient } from "./session-client";
import { normalizeReference } from "../reservations/access-store";
import type { AttemptStatus } from "../payments/online";
import type { CustomerBalance } from "../reservations/customer-view";
import type { ReservationStatus } from "../reservations/types";
import type { Money } from "../money";
import type { ReservationStatusDto } from "./dto";

/**
 * Online payment (hosted Stripe Checkout) as seen by the storefront. One function per endpoint of `ana-depot-api/docs/payments-stripe.md`. The browser never
 * sends an amount (the backend charges the current due of ONE currency), never decides success, and never talks to Stripe except by navigating to the
 * hosted page the backend returned.
 */
export interface PaymentOptionsDto { online: { provider: "STRIPE"; currencies: string[] } | null }
export interface CheckoutSessionDto { attemptId: string; checkoutUrl: string; currency: string; amount: string; expiresAt: string; reused: boolean }
export interface PaymentAttemptDto { id: string; currency: string; amount: string; status: AttemptStatus; settledAt?: string | null; createdAt: string }
export interface PaymentStatusDto {
  reservation: { reference: string; status: ReservationStatusDto; paymentStatus: "UNPAID" | "PARTIAL" | "PAID"; balances: { currency: string; total: string; paid: string; due: string }[] };
  attempt: PaymentAttemptDto | null;
  attempts: PaymentAttemptDto[];
}

type Opts = { signal?: AbortSignal };
/** Who is asking: a guest proves the reservation with the phone typed at reservation time; the signed-in owner uses the session token. */
export type PayerAccess = { kind: "guest"; phone: string } | { kind: "owner" };

const clientFor = async (access: PayerAccess) => {
  if (access.kind === "owner") return signedInClient();
  const c = anonymousApiClient(); // no token on purpose: a present-but-expired bearer would turn a guest call into a 401
  if (!c) throw new ApiError({ status: 0, code: "api_not_configured" });
  return c;
};
const bodyFor = (access: PayerAccess, rest: Record<string, unknown>) => (access.kind === "guest" ? { phone: access.phone, ...rest } : rest);
const path = (reference: string, tail: string) => `/api/v1/reservations/${encodeURIComponent(normalizeReference(reference))}/payments/${tail}`;

export const getPaymentOptions = async (o: Opts = {}): Promise<PaymentOptionsDto> => {
  const c = anonymousApiClient();
  if (!c) throw new ApiError({ status: 0, code: "api_not_configured" });
  return c.get<PaymentOptionsDto>("/api/v1/store/payment-options", undefined, o);
};

/** `idempotencyKey` is generated once per attempt by the caller (see `attemptKey`) and reused for an uncertain retry of the same reference + currency. */
export async function createCheckoutSession(reference: string, currency: string, access: PayerAccess, idempotencyKey: string, o: Opts = {}): Promise<CheckoutSessionDto> {
  return (await clientFor(access)).post<CheckoutSessionDto>(path(reference, "checkout-session"), bodyFor(access, { currency }), { idempotencyKey, signal: o.signal });
}

export async function getPaymentStatus(reference: string, access: PayerAccess, attemptId: string | undefined, o: Opts = {}): Promise<PaymentStatusDto> {
  return (await clientFor(access)).post<PaymentStatusDto>(path(reference, "status"), bodyFor(access, attemptId ? { attemptId } : {}), { signal: o.signal });
}

// ---- view model ------------------------------------------------------------------------------------------------------------------------------------

export interface AttemptView { id: string; currency: string; amount: Money; status: AttemptStatus; settledAt?: string; createdAt: string }
export interface PaymentStatusView {
  reference: string;
  reservationStatus: ReservationStatus;
  paymentStatus: "unpaid" | "partial" | "paid";
  balances: CustomerBalance[];
  attempt: AttemptView | null;
  attempts: AttemptView[];
}

const STATUS: Record<string, ReservationStatus> = { PENDING_REVIEW: "pending_review", CONFIRMED: "confirmed", READY_FOR_PICKUP: "ready_for_pickup", COLLECTED: "collected", REJECTED: "rejected", CANCELLED: "cancelled", EXPIRED: "expired" };
const PAY = { UNPAID: "unpaid", PARTIAL: "partial", PAID: "paid" } as const;
const ATTEMPT = new Set<string>(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "EXPIRED"]);
const money = (value: string, currency: string): Money | null => { const minor = decimalToMinor(value, currency); return minor === null ? null : { amount: minor, currency }; };

function toAttempt(d: PaymentAttemptDto | null | undefined): AttemptView | null {
  if (!d || !ATTEMPT.has(d.status)) return null;
  const amount = money(d.amount, d.currency);
  return amount ? { id: d.id, currency: d.currency, amount, status: d.status, settledAt: d.settledAt ?? undefined, createdAt: d.createdAt } : null;
}

/** The wire answer -> what the screen shows. Returns null when it cannot be shown truthfully (unknown status, unreadable money): the caller treats that as an error. */
export function toPaymentStatusView(dto: PaymentStatusDto): PaymentStatusView | null {
  const status = STATUS[dto.reservation?.status];
  const pay = PAY[dto.reservation?.paymentStatus];
  if (!status || !pay) return null;
  const balances: CustomerBalance[] = [];
  for (const b of dto.reservation.balances ?? []) {
    const total = money(b.total, b.currency), paid = money(b.paid, b.currency), due = money(b.due, b.currency);
    if (!total || !paid || !due) return null;
    balances.push({ currency: b.currency, total, paid, due });
  }
  const attempts = (dto.attempts ?? []).map(toAttempt).filter((a): a is AttemptView => a !== null);
  return { reference: dto.reservation.reference, reservationStatus: status, paymentStatus: pay, balances, attempt: toAttempt(dto.attempt), attempts };
}
