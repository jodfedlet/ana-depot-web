import type { Messages } from "@/i18n/types";
import { ApiError, type ApiProblem } from "./http";

type ApiErrorCode = keyof Messages["apiErrors"];
export type ApiErrorKey = `apiErrors.${ApiErrorCode}`;

/** Codes that have their own customer-facing message (`apiErrors.<code>` in both languages). Anything else falls back by status class. */
const KNOWN = [
  "api_not_configured", "network_error", "timeout", "invalid_response", "session_expired", "unauthenticated", "forbidden", "not_found", "reservation_not_found",
  "rate_limited", "insufficient_stock", "product_unavailable", "price_not_available", "variant_required", "variant_unavailable", "below_minimum_order", "unsupported_currency",
  "currency_required", "pickup_disabled", "pickup_not_configured", "idempotency_key_reuse", "validation_failed", "terms_not_acknowledged", "search_query_too_long", "invalid_page",
  "page_out_of_range", "filter_invalid", "concurrent_update", "internal_error",
  // staff (administration) codes
  "duplicate_sku", "duplicate_slug", "invalid_status", "payment_required", "already_paid", "already_reversed", "inventory_exists", "stock_negative", "stock_invalid", "inventory_not_tracked", "variant_in_use", "product_in_use", "category_has_active_products", "attribute_in_use", "option_in_use", "attribute_type_locked", "variant_axis_in_use", "attribute_required_violation", "category_inactive", "product_not_in_category", "order_incomplete", "upload_type_not_allowed", "upload_too_large", "upload_missing", "upload_type_mismatch", "upload_signature_mismatch", "upload_not_pending", "upload_expired", "images_order_invalid", "storage_unavailable", "storage_not_configured", "customer_managed_by_owner", "period_too_long", "date_range_invalid", "reason_required", "currency_invalid", "paid_negative", "ledger_amount_zero", "idempotency_key_required", "price_required", "retail_price_invalid", "sale_price_invalid", "wholesale_disabled_with_tiers", "required_to_publish", "upload_put_failed", "upload_aborted", "busy",
  // online payment (hosted Stripe Checkout)
  "online_payment_unavailable", "currency_not_available_online", "amount_below_minimum", "payment_provider_error", "online_payment_reversal_unsupported", "method_not_allowed",
] as const satisfies readonly ApiErrorCode[];
const known = new Set<string>(KNOWN);

export const problemOf = (error: unknown): ApiProblem | null => (error instanceof ApiError ? error.problem : null);

/**
 * The customer-facing message key for a failed call. Raw `detail` text and stack traces are never shown: the backend's `code` is translated,
 * and unknown codes fall back by HTTP status (429, 5xx, 404…). Anything that is not an `ApiError` is a generic failure.
 */
export function apiErrorKey(error: unknown): ApiErrorKey {
  const p = problemOf(error);
  if (!p) return "apiErrors.generic";
  if (known.has(p.code)) return `apiErrors.${p.code}` as ApiErrorKey;
  if (p.status === 401) return "apiErrors.unauthenticated";
  if (p.status === 403) return "apiErrors.forbidden";
  if (p.status === 404) return "apiErrors.not_found";
  if (p.status === 429) return "apiErrors.rate_limited";
  if (p.status === 400 || p.status === 422) return "apiErrors.validation_failed";
  if (p.status === 409) return "apiErrors.conflict";
  if (p.status >= 500) return "apiErrors.server";
  return "apiErrors.generic";
}

/**
 * True when a write may or may not have been applied: the request left the browser but no answer came back. A reservation submit in this state
 * must be retried ONLY with the same Idempotency-Key (which can return the original reservation, never create a second one).
 */
export const isUncertainOutcome = (error: unknown): boolean => {
  const p = problemOf(error);
  return !!p && (p.code === "timeout" || p.code === "network_error" || p.status === 502 || p.status === 503 || p.status === 504);
};

export const isSessionProblem = (error: unknown): boolean => {
  const p = problemOf(error);
  return !!p && (p.code === "session_expired" || p.status === 401);
};

/** Field problems of a 400/422 as `field -> code`, so a form can mark the matching inputs. */
export function fieldProblems(error: unknown): Record<string, string> {
  const p = problemOf(error);
  return Object.fromEntries((p?.errors ?? []).map((e) => [e.field, e.code]));
}

/** The message for ONE field problem of a 400/422 (`errors[{field, code}]`); unknown codes read as "invalid value". */
export function fieldErrorKey(code: string): `fieldErrors.${keyof Messages["fieldErrors"]}` {
  return (code in FIELD_CODES ? `fieldErrors.${code}` : "fieldErrors.invalid") as `fieldErrors.${keyof Messages["fieldErrors"]}`;
}
const FIELD_CODES: Record<string, true> = Object.fromEntries(["required", "invalid", "too_long", "too_many_decimals", "must_be_positive", "phone_invalid", "email_invalid", "country_invalid", "schedule_one_day", "time_invalid", "schedule_hours", "day_invalid", "hold_period_invalid", "required_to_publish", "retail_price_invalid", "sale_price_invalid", "price_required", "duplicate_sku", "duplicate_slug"].map((c) => [c, true]));

/** True for a version conflict: someone else changed the record first; the screen must reload it and tell the staff member. */
export const isVersionConflict = (error: unknown): boolean => problemOf(error)?.code === "concurrent_update";
/** 403 from the API: signed in, but not staff (or not allowed). Distinct from 401 (no valid session). */
export const isForbidden = (error: unknown): boolean => problemOf(error)?.status === 403;

/** A failure where the write may or may not have been applied (no answer, or the gateway/server failed): the retry must reuse the same idempotency key. */
export const isTransientError = (error: unknown): boolean => { const p = problemOf(error); return !!p && (p.code === "timeout" || p.code === "network_error" || p.status >= 502); };
