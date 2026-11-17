import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/auth/supabase-browser", () => ({ getBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: session.token ? { access_token: session.token } : null } }) } }) }));

import { createCheckoutSession, getPaymentOptions, getPaymentStatus, toPaymentStatusView, type PaymentStatusDto } from "./online-payments";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
const call = (n = 0) => { const [url, init] = fetchMock.mock.calls[n] as unknown as [URL, RequestInit & { headers: Record<string, string> }]; return { url: new URL(String(url)), init, body: init.body ? JSON.parse(String(init.body)) : undefined }; };

beforeEach(() => { process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test"; session.token = null; fetchMock = vi.fn(async () => json(200, {})); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.NEXT_PUBLIC_API_BASE_URL; });

describe("online payment calls (MOCKED fetch: proves wiring, not the real backend or Stripe)", () => {
  it("reads the payment options anonymously", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { online: { provider: "STRIPE", currencies: ["USD"] } }));
    expect((await getPaymentOptions()).online?.currencies).toEqual(["USD"]);
    const c = call();
    expect(c.url.pathname).toBe("/api/v1/store/payment-options");
    expect(c.init.headers.Authorization).toBeUndefined();
  });
  it("a guest creates a session with phone + currency only, a required idempotency key, and NO token and NO amount", async () => {
    session.token = "ignored-for-guests";
    fetchMock.mockResolvedValueOnce(json(201, { attemptId: "a1", checkoutUrl: "https://checkout.stripe.com/c/pay/x", currency: "USD", amount: "18.50", expiresAt: "2026-11-17T00:00:00Z", reused: false }));
    const r = await createCheckoutSession(" ana-k7m2qx ", "USD", { kind: "guest", phone: "34567890" }, "key-1");
    expect(r.checkoutUrl).toContain("stripe.com");
    const c = call();
    expect(c.url.pathname).toBe("/api/v1/reservations/ANA-K7M2QX/payments/checkout-session");
    expect(c.init.method).toBe("POST");
    expect(c.init.headers["Idempotency-Key"]).toBe("key-1");
    expect(c.init.headers.Authorization).toBeUndefined();
    expect(c.body).toEqual({ phone: "34567890", currency: "USD" });
  });
  it("the signed-in owner sends the bearer token and no phone; without a session it fails instead of going anonymous", async () => {
    session.token = "tok";
    fetchMock.mockResolvedValueOnce(json(201, {}));
    await createCheckoutSession("ANA-K7M2QX", "USD", { kind: "owner" }, "key-2");
    expect(call().init.headers.Authorization).toBe("Bearer tok");
    expect(call().body).toEqual({ currency: "USD" });
    session.token = null;
    await expect(createCheckoutSession("ANA-K7M2QX", "USD", { kind: "owner" }, "key-3")).rejects.toMatchObject({ problem: { code: "session_expired" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("status asks the backend (POST, phone in the body, never in the URL)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await getPaymentStatus("ANA-K7M2QX", { kind: "guest", phone: "34567890" }, "att-1");
    const c = call();
    expect(c.url.pathname).toBe("/api/v1/reservations/ANA-K7M2QX/payments/status");
    expect(c.url.search).toBe("");
    expect(c.body).toEqual({ phone: "34567890", attemptId: "att-1" });
  });
  it("surfaces the backend error code unchanged", async () => {
    fetchMock.mockResolvedValueOnce(json(422, { code: "currency_not_available_online", status: 422 }));
    await expect(createCheckoutSession("ANA-K7M2QX", "HTG", { kind: "guest", phone: "1" }, "k")).rejects.toMatchObject({ problem: { code: "currency_not_available_online", status: 422 } });
  });
});

const dto = (over: Partial<PaymentStatusDto> = {}): PaymentStatusDto => ({
  reservation: { reference: "ANA-K7M2QX", status: "READY_FOR_PICKUP", paymentStatus: "PARTIAL", balances: [{ currency: "HTG", total: "1500.00", paid: "0.00", due: "1500.00" }, { currency: "USD", total: "18.50", paid: "18.50", due: "0.00" }] },
  attempt: { id: "a1", currency: "USD", amount: "18.50", status: "SUCCEEDED", settledAt: "2026-11-17T10:00:00Z", createdAt: "2026-11-17T09:58:00Z" },
  attempts: [],
  ...over,
});

describe("payment status -> view", () => {
  it("keeps one balance per currency and the settled amount in its own currency (minor units)", () => {
    const v = toPaymentStatusView(dto())!;
    expect(v.reservationStatus).toBe("ready_for_pickup");
    expect(v.paymentStatus).toBe("partial");
    expect(v.balances.map((b) => [b.currency, b.due.amount])).toEqual([["HTG", 150000], ["USD", 0]]);
    expect(v.attempt).toMatchObject({ status: "SUCCEEDED", amount: { amount: 1850, currency: "USD" } });
  });
  it("is null (an error, never made-up figures) for unknown statuses or unreadable money", () => {
    expect(toPaymentStatusView(dto({ reservation: { ...dto().reservation, status: "WEIRD" as never } }))).toBeNull();
    expect(toPaymentStatusView(dto({ reservation: { ...dto().reservation, balances: [{ currency: "USD", total: "x", paid: "0", due: "0" }] } }))).toBeNull();
  });
  it("drops an attempt with an unknown status instead of showing it as success", () => {
    const v = toPaymentStatusView(dto({ attempt: { id: "a", currency: "USD", amount: "1.00", status: "MAYBE" as never, createdAt: "x" } }))!;
    expect(v.attempt).toBeNull();
  });
});
