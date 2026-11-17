import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/auth/supabase-browser", () => ({ getBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: session.token ? { access_token: session.token } : null } }) } }) }));

import { ApiError } from "./http";
import { backendSort, getPickup, getProduct, listMyReservations, lookupReservation, saveProfile, searchProducts, submitReservation, toApiQuery } from "./public";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
const call = (n = 0) => { const [url, init] = fetchMock.mock.calls[n] as unknown as [URL, RequestInit & { headers: Record<string, string> }]; return { url: new URL(String(url)), init }; };

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test";
  session.token = null;
  fetchMock = vi.fn(async () => json(200, { items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.NEXT_PUBLIC_API_BASE_URL; });

describe("query building (URL query -> API parameters)", () => {
  it("sends zero-based pages, the documented filters and repeated attr/brand parameters", () => {
    expect(toApiQuery({ q: " tapis ", category: "home", currency: "USD", minPrice: 1000, maxPrice: 25050, wholesaleOnly: true, inStockOnly: true, attributes: { size: ["s", "l"], color: ["red"] }, brands: ["Ana"], sort: "price-asc", page: 3 }, 12)).toEqual({
      q: "tapis", category: "home", currency: "USD", minPrice: "10.00", maxPrice: "250.50", wholesale: true, inStock: true, attr: ["size:s", "size:l", "color:red"], brand: ["Ana"], sort: "price-asc", page: 2, size: 12,
    });
  });
  it("never sends a price bound or price sort without a currency (HTG and USD are never compared)", () => {
    const q = toApiQuery({ minPrice: 1000, sort: "price-desc" }, 12);
    expect(q.minPrice).toBeUndefined();
    expect(q.sort).toBeUndefined();
  });
  it("leaves the sort to the API by default and only asks for relevance with a text query", () => {
    expect(backendSort(undefined, { q: "x" })).toBeUndefined();
    expect(backendSort("relevance", { q: "x" })).toBe("relevance");
    expect(backendSort("relevance", {})).toBeUndefined();
    expect(backendSort("name-asc", {})).toBe("name");
  });
});

describe("storefront calls (MOCKED fetch: proves wiring, not the real backend)", () => {
  it("public reads carry NO Authorization header even when a session exists (an expired token would turn a public read into a 401)", async () => {
    session.token = "a-token";
    await searchProducts({ q: "tapis" }, 12);
    await getProduct("matelas-confort");
    await getPickup();
    for (const i of [0, 1, 2]) expect(call(i).init.headers).not.toHaveProperty("Authorization");
  });

  it("search with a text query uses the full-text endpoint; browsing uses the listing", async () => {
    await searchProducts({ q: "tapis", page: 2 }, 12);
    await searchProducts({ category: "home" }, 12);
    expect(call(0).url.pathname).toBe("/api/v1/products/search");
    expect(call(0).url.searchParams.get("q")).toBe("tapis");
    expect(call(0).url.searchParams.get("page")).toBe("1");
    expect(call(1).url.pathname).toBe("/api/v1/products");
    expect(call(1).url.searchParams.get("q")).toBeNull();
  });

  it("a reservation sends identifiers, quantities and currencies plus the Idempotency-Key, and NEVER a price or total", async () => {
    fetchMock.mockImplementation(async () => json(201, { reference: "ANA-1" }));
    await submitReservation({ lines: [{ productId: "p1", quantity: 2, currency: "HTG" }, { productId: "p1", quantity: 1, currency: "USD" }], contact: { firstName: "A", lastName: "B", dialCode: "+509", phone: "37000000" }, locale: "fr", acknowledgedTerms: true }, "key-123456789", { signedIn: false });
    const { url, init } = call();
    expect(url.pathname).toBe("/api/v1/reservations");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("key-123456789");
    expect(init.headers).not.toHaveProperty("Authorization");
    const body = String(init.body);
    expect(JSON.parse(body).lines).toEqual([{ productId: "p1", quantity: 2, currency: "HTG" }, { productId: "p1", quantity: 1, currency: "USD" }]);
    expect(body).not.toMatch(/price|total|amount/i);
  });

  it("a signed-in submit carries the token; if the session cannot supply one it FAILS instead of sending a guest request", async () => {
    fetchMock.mockImplementation(async () => json(201, { reference: "ANA-1" }));
    const request = { lines: [{ productId: "p1", quantity: 1, currency: "HTG" }], contact: { firstName: "A", lastName: "B", dialCode: "+509", phone: "37000000" }, locale: "fr", acknowledgedTerms: true };
    session.token = "live-token";
    await submitReservation(request, "key-123456789", { signedIn: true });
    expect(call().init.headers.Authorization).toBe("Bearer live-token");

    fetchMock.mockClear();
    session.token = null; // the session expired between page load and click
    const error = await submitReservation(request, "key-123456789", { signedIn: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.code).toBe("session_expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tracking sends reference and phone in the POST body, never in the URL", async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    await lookupReservation("ANA-K7M2QX", "+509 3700 0000");
    const { url, init } = call();
    expect(url.pathname).toBe("/api/v1/reservations/lookup");
    expect(url.search).toBe("");
    expect(JSON.parse(String(init.body))).toEqual({ reference: "ANA-K7M2QX", phone: "+509 3700 0000" });
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("account calls need a session and never degrade to anonymous", async () => {
    fetchMock.mockImplementation(async () => json(200, {}));
    for (const run of [() => listMyReservations(0, 10), () => saveProfile({ firstName: "A", lastName: "B", dialCode: "+509", phone: "37000000" })]) {
      const error = await run().catch((e: unknown) => e);
      expect((error as ApiError).problem.code).toBe("session_expired");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    session.token = "tok";
    await listMyReservations(1, 10);
    expect(call().url.pathname).toBe("/api/v1/me/reservations");
    expect(call().url.searchParams.get("page")).toBe("1");
    expect(call().init.headers.Authorization).toBe("Bearer tok");
  });

  it("reports a missing API base URL as a configuration problem, not a crash", async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    const error = await getPickup().catch((e: unknown) => e);
    expect((error as ApiError).problem.code).toBe("api_not_configured");
  });
});
