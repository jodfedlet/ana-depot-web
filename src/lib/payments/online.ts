import type { CustomerBalance } from "@/lib/reservations/customer-view";
import type { ReservationStatus } from "@/lib/reservations/types";

/**
 * Pure rules of the online-payment screens (hosted Stripe Checkout). Nothing here decides whether a payment succeeded: that is the backend's answer,
 * confirmed by a verified provider webhook. These helpers only decide what to SHOW and where it is safe to send the browser.
 */
export type AttemptStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "EXPIRED";

/** The backend will not change these any more (`SUCCEEDED` always wins over a late `FAILED`/`EXPIRED`, so polling can stop on any of them). */
export const isTerminalAttempt = (s: AttemptStatus): boolean => s === "SUCCEEDED" || s === "FAILED" || s === "EXPIRED";

/** Payments are accepted only while the reservation is ready for pickup (backend rule); earlier, the online option is only announced. */
export const acceptsOnlinePayment = (status: ReservationStatus): boolean => status === "ready_for_pickup";
export const announcesOnlinePayment = (status: ReservationStatus): boolean => status === "pending_review" || status === "confirmed";

/**
 * Defence in depth before `window.location.assign`: the URL must come from the backend AND still look like Stripe's hosted page — https, no credentials,
 * default port, host `stripe.com` or a subdomain of it (for example `checkout.stripe.com`). Anything else is refused and nothing is opened.
 *
 * LOCAL VERIFICATION ONLY: `NEXT_PUBLIC_CHECKOUT_TEST_ORIGIN` (build time, for example `http://127.0.0.1:9199`, a fake Stripe) additionally allows EXACTLY that one
 * origin (scheme + host + port) and nothing else. It must never be set in a production build (`checkoutTestOriginWarning` reports it).
 */
export function isSafeCheckoutUrl(value: unknown, testOrigin: string | undefined = process.env.NEXT_PUBLIC_CHECKOUT_TEST_ORIGIN): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const u = new URL(value);
    if (u.username !== "" || u.password !== "") return false;
    if (testOrigin && u.origin === exactOrigin(testOrigin)) return true;
    return u.protocol === "https:" && u.port === "" && (u.hostname === "stripe.com" || u.hostname.endsWith(".stripe.com"));
  } catch {
    return false;
  }
}

/** The origin of a configured test URL, or null when it is not a plain http(s) origin (a malformed value allows nothing). */
function exactOrigin(configured: string): string | null {
  try {
    const u = new URL(configured.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Gentle polling after the customer returns from Stripe: 2 s, 4 s, 8 s, then every 15 s, about two minutes in all. After that the screen stops asking and shows
 * a manual "check again" button (the webhook may simply be late; the reservation is untouched either way).
 */
export const POLL_DELAYS_MS: readonly number[] = [2000, 4000, 8000, 15000, 15000, 15000, 15000, 15000, 15000, 15000];
export const pollDelayMs = (attemptIndex: number): number | null => POLL_DELAYS_MS[attemptIndex] ?? null;

/**
 * The balances still due, split by whether online payment is offered for that currency (from `GET /store/payment-options`). One entry per currency, never combined,
 * never converted: a currency that is not offered stays payable at the store.
 */
export function splitDue(balances: readonly CustomerBalance[], offered: readonly string[]): { online: CustomerBalance[]; atStoreOnly: CustomerBalance[] } {
  const owing = balances.filter((b) => b.due.amount > 0);
  return { online: owing.filter((b) => offered.includes(b.currency)), atStoreOnly: owing.filter((b) => !offered.includes(b.currency)) };
}

/** The page the customer is sent back to by Stripe (fixed paths; the backend builds the absolute URLs from its own configured origin). */
export const returnPath = (reference: string, attemptId?: string): string => `/payment/return?reference=${encodeURIComponent(reference)}${attemptId ? `&attempt=${encodeURIComponent(attemptId)}` : ""}`;

/** Bounds a reference taken from the URL before it is sent anywhere: the API's own format is `ANA-XXXXXX`; anything else is refused locally. */
export const isReferenceShape = (value: string): boolean => /^ANA-[A-Z2-9]{6}$/.test(value.replace(/\s+/g, "").toUpperCase());
