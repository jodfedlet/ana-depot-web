/**
 * Client error reporting: ONE integration point, no vendor dependency.
 *
 * Nothing is sent anywhere until the business picks a monitoring service and registers a sink with `setErrorSink` (a Sentry-style SDK, a
 * log drain...). Until then reports only go to `console.error`. What a report may contain is fixed here, so no sink can receive more than this:
 *  - the error's class name and a stable `code` (`ApiError.problem.code`) or a short message of OUR OWN code (never an API `detail`, never a response body),
 *  - the HTTP status and the API correlation id (to find the server log line),
 *  - the route PATH (no query string, no hash: they can hold phone numbers or references).
 * Never: tokens, cookies, form values, request bodies, names, phones, e-mail addresses, the user id.
 */
import { ApiError } from "@/lib/api/http";

export interface ClientErrorReport {
  name: string;
  code?: string;
  status?: number;
  correlationId?: string;
  message?: string;
  path?: string;
}
type Sink = (report: ClientErrorReport) => void;

let sink: Sink | null = null;
export const setErrorSink = (next: Sink | null): void => { sink = next; };

const MAX_MESSAGE = 160;
const scrub = (text: string): string =>
  text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]").replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[jwt]").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]").slice(0, MAX_MESSAGE);

/** Builds the privacy-safe report for an error. Pure: exported for tests. */
export function toReport(error: unknown, path?: string): ClientErrorReport {
  const safePath = path?.split(/[?#]/)[0];
  if (error instanceof ApiError) {
    const { code, status, correlationId } = error.problem;
    return { name: "ApiError", code, status, correlationId, path: safePath }; // `detail` is deliberately dropped
  }
  if (error instanceof Error) return { name: error.name, message: scrub(error.message), path: safePath };
  return { name: "NonError", path: safePath };
}

/** Never throws, so reporting can not turn one failure into two. */
export function reportClientError(error: unknown, path: string | undefined = typeof window === "undefined" ? undefined : window.location.pathname): void {
  const report = toReport(error, path);
  try {
    if (sink) sink(report);
    else console.error("[client-error]", report);
  } catch {
    /* a failing sink must not break the page */
  }
}
