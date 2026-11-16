import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./http";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json", ...headers } });

/** Resolves with the ApiError a call rejects with (fails the test if it succeeds). */
async function fail(call: Promise<unknown>): Promise<ApiError> {
  try { await call; } catch (e) { return e as ApiError; }
  throw new Error("expected the call to fail");
}

describe("API client (mocked fetch)", () => {
  it("sends bearer token, correlation id and idempotency key; parses JSON", async () => {
    const fetchImpl = vi.fn(async () => json(200, { id: "r1" }));
    const api = createApiClient({ baseUrl: "http://api/", getAccessToken: async () => "tok", fetchImpl: fetchImpl as unknown as typeof fetch, newId: () => "corr-1" });
    expect(await api.post("/api/v1/reservations", { a: 1 }, { idempotencyKey: "key-12345678" })).toEqual({ id: "r1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://api/api/v1/reservations");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "X-Correlation-Id": "corr-1", "Idempotency-Key": "key-12345678", "Content-Type": "application/json" });
    expect(init.body).toBe('{"a":1}');
  });
  it("omits Authorization without a token and Idempotency-Key unless given; builds query strings", async () => {
    const fetchImpl = vi.fn(async () => json(200, []));
    const api = createApiClient({ baseUrl: "http://api", fetchImpl: fetchImpl as unknown as typeof fetch });
    await api.get("/api/v1/products", { page: 0, size: 10, status: undefined });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://api/api/v1/products?page=0&size=10");
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
  });
  it("parses RFC 9457 problems with their stable code, field errors, correlation id and Retry-After", async () => {
    const fetchImpl = vi.fn(async () => json(429, { code: "rate_limited", title: "Too many requests", errors: [{ field: "qty", code: "min" }, { nope: 1 }] }, { "retry-after": "30", "x-correlation-id": "srv-1" }));
    const api = createApiClient({ baseUrl: "http://api", fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await fail(api.get("/x"));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem).toMatchObject({ status: 429, code: "rate_limited", correlationId: "srv-1", retryAfterSeconds: 30, errors: [{ field: "qty", code: "min" }] });
    expect((error as ApiError).retryable).toBe(true);
  });
  it("treats validation/authorization failures as permanent and transport failures as retryable", async () => {
    const mk = (f: () => Promise<Response>) => createApiClient({ baseUrl: "http://api", fetchImpl: f as unknown as typeof fetch });
    const e422 = await fail(mk(async () => json(422, { code: "insufficient_stock" })).get("/x"));
    expect(e422.problem.code).toBe("insufficient_stock");
    expect(e422.retryable).toBe(false);
    expect((await fail(mk(async () => json(401, {})).get("/x"))).retryable).toBe(false);
    expect((await fail(mk(async () => json(403, {})).get("/x"))).problem.code).toBe("http_403");
    const down = await fail(mk(async () => { throw new TypeError("fetch failed"); }).get("/x"));
    expect(down.problem.code).toBe("network_error");
    expect(down.retryable).toBe(true);
    const timeout = await fail(mk(async () => { throw new DOMException("t", "TimeoutError"); }).get("/x"));
    expect(timeout.problem.code).toBe("timeout");
    const bad = await fail(mk(async () => new Response("not json", { status: 200 })).get("/x"));
    expect(bad.problem.code).toBe("invalid_response");
  });
  it("returns undefined for 204", async () => {
    const api = createApiClient({ baseUrl: "http://api", fetchImpl: (async () => new Response(null, { status: 204 })) as unknown as typeof fetch });
    expect(await api.delete("/x")).toBeUndefined();
  });
});
