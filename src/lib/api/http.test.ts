import { describe, expect, it, vi } from "vitest";
import { ApiError, backoffDelayMs, createApiClient } from "./http";

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

describe("timeouts, retries and backoff", () => {
  const mk = (f: (...a: unknown[]) => Promise<Response>, extra = {}) => {
    const sleeps: number[] = [];
    const api = createApiClient({ baseUrl: "http://api", fetchImpl: f as unknown as typeof fetch, sleep: async (ms) => { sleeps.push(ms); }, random: () => 1, newId: () => "corr-1", ...extra });
    return { api, sleeps };
  };
  it("retries an idempotent GET after a transport failure or 503, with growing jittered delays, then succeeds under ONE correlation id", async () => {
    const ids: string[] = [];
    let n = 0;
    const { api, sleeps } = mk(async (_u, init) => { ids.push(((init as RequestInit).headers as Record<string, string>)["X-Correlation-Id"]); if (++n === 1) throw new TypeError("down"); if (n === 2) return json(503, { code: "storage_unavailable" }); return json(200, { ok: true }); });
    expect(await api.get("/x")).toEqual({ ok: true });
    expect(n).toBe(3);
    expect(sleeps).toEqual([300, 600]); // random()=1 -> the cap of each attempt: 300 ms, then 600 ms
    expect(new Set(ids)).toEqual(new Set(["corr-1"]));
  });
  it("gives up after the bounded number of attempts and reports the last failure", async () => {
    let n = 0;
    const { api } = mk(async () => { n++; return json(503, { code: "storage_unavailable" }); });
    expect((await fail(api.get("/x"))).problem.code).toBe("storage_unavailable");
    expect(n).toBe(3); // 1 + 2 retries
  });
  it("NEVER retries a write, even after a timeout (that needs the same Idempotency-Key, decided by the caller)", async () => {
    for (const method of ["post", "put", "patch"] as const) {
      let n = 0;
      const { api, sleeps } = mk(async () => { n++; throw new DOMException("t", "TimeoutError"); });
      expect((await fail(api[method]("/x", {}, { idempotencyKey: "key-12345678" }))).problem.code).toBe("timeout");
      expect(n).toBe(1);
      expect(sleeps).toEqual([]);
    }
    let d = 0;
    const { api } = mk(async () => { d++; return json(503, {}); });
    await fail(api.delete("/x"));
    expect(d).toBe(1);
  });
  it("does not retry permanent answers or 429 (that would only feed the rate limiter)", async () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429, 500]) {
      let n = 0;
      const { api } = mk(async () => { n++; return json(status, {}); });
      await fail(api.get("/x"));
      expect(n, `status ${status}`).toBe(1);
    }
  });
  it("does not retry a call the caller cancelled", async () => {
    const ctl = new AbortController();
    let n = 0;
    const { api } = mk(async () => { n++; ctl.abort(); throw new DOMException("aborted", "AbortError"); });
    await fail(api.get("/x", undefined, { signal: ctl.signal }));
    expect(n).toBe(1);
  });
  it("applies the timeout even when the caller passes its own signal", async () => {
    const seen: AbortSignal[] = [];
    const ctl = new AbortController();
    const { api } = mk(async (_u, init) => { seen.push((init as RequestInit).signal as AbortSignal); return json(200, {}); }, { timeoutMs: 5 });
    await api.get("/x", undefined, { signal: ctl.signal });
    expect(seen[0]).not.toBe(ctl.signal); // a combined signal (caller OR timeout)
    await new Promise((r) => setTimeout(r, 30));
    expect(seen[0].aborted).toBe(true);
    expect(ctl.signal.aborted).toBe(false);
  });
  it("backoff is exponential, capped at 3 s and fully jittered (0..cap)", () => {
    expect([1, 2, 3, 4, 5, 6].map((a) => backoffDelayMs(a, () => 1))).toEqual([300, 600, 1200, 2400, 3000, 3000]);
    expect(backoffDelayMs(3, () => 0)).toBe(0);
    expect(backoffDelayMs(2, () => 0.5)).toBe(300);
  });
});
