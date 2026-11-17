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
