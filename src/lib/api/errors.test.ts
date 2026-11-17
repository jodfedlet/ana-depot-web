import { describe, expect, it } from "vitest";
import { fr } from "@/i18n/messages/fr";
import { ht } from "@/i18n/messages/ht";
import { apiErrorKey, fieldProblems, isSessionProblem, isUncertainOutcome } from "./errors";
import { ApiError } from "./http";

const err = (status: number, code: string, extra: object = {}) => new ApiError({ status, code, ...extra });

describe("customer-safe error messages", () => {
  it("translates the backend's stable codes", () => {
    expect(apiErrorKey(err(409, "insufficient_stock", { detail: "Only 3 available, 5 requested" }))).toBe("apiErrors.insufficient_stock");
    expect(apiErrorKey(err(422, "pickup_not_configured"))).toBe("apiErrors.pickup_not_configured");
    expect(apiErrorKey(err(409, "idempotency_key_reuse"))).toBe("apiErrors.idempotency_key_reuse");
  });
  it("falls back by status for unknown codes, never exposing the raw detail", () => {
    expect(apiErrorKey(err(429, "http_429"))).toBe("apiErrors.rate_limited");
    expect(apiErrorKey(err(503, "http_503", { detail: "java.lang.NullPointerException at ..." }))).toBe("apiErrors.server");
    expect(apiErrorKey(err(500, "boom"))).toBe("apiErrors.server");
    expect(apiErrorKey(err(404, "something_else"))).toBe("apiErrors.not_found");
    expect(apiErrorKey(err(401, "x"))).toBe("apiErrors.unauthenticated");
    expect(apiErrorKey(err(403, "x"))).toBe("apiErrors.forbidden");
    expect(apiErrorKey(err(400, "bad_request"))).toBe("apiErrors.validation_failed");
    expect(apiErrorKey(err(409, "data_conflict"))).toBe("apiErrors.conflict");
    expect(apiErrorKey(new Error("TypeError: x is undefined"))).toBe("apiErrors.generic");
    expect(apiErrorKey(undefined)).toBe("apiErrors.generic");
  });
  it("covers network failures and timeouts", () => {
    expect(apiErrorKey(err(0, "network_error"))).toBe("apiErrors.network_error");
    expect(apiErrorKey(err(0, "timeout"))).toBe("apiErrors.timeout");
  });
  it("every message exists in French and Haitian Creole and none leaks technical wording", () => {
    for (const key of Object.keys(fr.apiErrors)) {
      const f = (fr.apiErrors as Record<string, string>)[key];
      const h = (ht.apiErrors as Record<string, string>)[key];
      expect(f.length).toBeGreaterThan(10);
      expect(h.length).toBeGreaterThan(10);
      expect(f + h).not.toMatch(/exception|stack|null|undefined|sql|http \d|idempotency-key/i);
    }
  });
});

describe("uncertain outcomes and sessions", () => {
  it("a timeout or lost connection is uncertain (retry only with the same key); a definite answer is not", () => {
    expect(isUncertainOutcome(err(0, "timeout"))).toBe(true);
    expect(isUncertainOutcome(err(0, "network_error"))).toBe(true);
    expect(isUncertainOutcome(err(503, "http_503"))).toBe(true);
    expect(isUncertainOutcome(err(409, "insufficient_stock"))).toBe(false);
    expect(isUncertainOutcome(err(422, "validation_failed"))).toBe(false);
    expect(isUncertainOutcome(err(429, "rate_limited"))).toBe(false);
  });
  it("recognises an expired session", () => {
    expect(isSessionProblem(err(401, "unauthenticated"))).toBe(true);
    expect(isSessionProblem(err(401, "session_expired"))).toBe(true);
    expect(isSessionProblem(err(403, "forbidden"))).toBe(false);
  });
  it("extracts field problems for forms", () => {
    expect(fieldProblems(err(422, "validation_failed", { errors: [{ field: "contact.phone", code: "invalid" }, { field: "acknowledgedTerms", code: "terms_not_acknowledged" }] }))).toEqual({ "contact.phone": "invalid", acknowledgedTerms: "terms_not_acknowledged" });
    expect(fieldProblems(new Error("x"))).toEqual({});
  });
});
