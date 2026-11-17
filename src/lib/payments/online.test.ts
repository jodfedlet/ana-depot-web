import { describe, expect, it } from "vitest";
import { acceptsOnlinePayment, announcesOnlinePayment, isReferenceShape, isSafeCheckoutUrl, isTerminalAttempt, POLL_DELAYS_MS, pollDelayMs, returnPath, splitDue } from "./online";

const bal = (currency: string, due: number) => ({ currency, total: { amount: 5000, currency }, paid: { amount: 5000 - due, currency }, due: { amount: due, currency } });

describe("checkout redirect target (defence in depth before window.location.assign)", () => {
  it("accepts only https on stripe.com or its subdomains", () => {
    expect(isSafeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_123#frag")).toBe(true);
    expect(isSafeCheckoutUrl("https://stripe.com/x")).toBe(true);
  });
  it.each([
    "http://checkout.stripe.com/c/pay/x", "https://evil.com/checkout.stripe.com", "https://checkout.stripe.com.evil.com/x", "https://notstripe.com/x", "https://evilstripe.com/x",
    "https://user:pw@checkout.stripe.com/x", "https://checkout.stripe.com:8443/x", "javascript:alert(1)", "data:text/html,x", "//checkout.stripe.com/x", "/relative", "", "not a url",
  ])("refuses %s", (u) => expect(isSafeCheckoutUrl(u)).toBe(false));
  it("refuses non-strings and absurdly long values", () => {
    expect(isSafeCheckoutUrl(null)).toBe(false);
    expect(isSafeCheckoutUrl(undefined)).toBe(false);
    expect(isSafeCheckoutUrl({ href: "https://stripe.com" })).toBe(false);
    expect(isSafeCheckoutUrl(`https://checkout.stripe.com/${"a".repeat(3000)}`)).toBe(false);
  });
});

describe("polling schedule after returning from Stripe", () => {
  it("is gentle (2s, 4s, 8s, then 15s) and bounded to about two minutes", () => {
    expect(POLL_DELAYS_MS.slice(0, 4)).toEqual([2000, 4000, 8000, 15000]);
    expect(POLL_DELAYS_MS.every((d) => d >= 2000)).toBe(true);
    const total = POLL_DELAYS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(90_000);
    expect(total).toBeLessThanOrEqual(180_000);
    expect(pollDelayMs(POLL_DELAYS_MS.length)).toBeNull();
    expect(pollDelayMs(0)).toBe(2000);
  });
  it("treats only SUCCEEDED, FAILED and EXPIRED as final", () => {
    expect(["PENDING", "PROCESSING"].map((s) => isTerminalAttempt(s as never))).toEqual([false, false]);
    expect(["SUCCEEDED", "FAILED", "EXPIRED"].map((s) => isTerminalAttempt(s as never))).toEqual([true, true, true]);
  });
});

describe("when the online option appears", () => {
  it("is an action only while the reservation is ready for pickup, an announcement before", () => {
    expect(acceptsOnlinePayment("ready_for_pickup")).toBe(true);
    for (const s of ["pending_review", "confirmed", "collected", "rejected", "cancelled", "expired"] as const) expect(acceptsOnlinePayment(s)).toBe(false);
    expect(announcesOnlinePayment("pending_review")).toBe(true);
    expect(announcesOnlinePayment("confirmed")).toBe(true);
    expect(announcesOnlinePayment("ready_for_pickup")).toBe(false);
    expect(announcesOnlinePayment("rejected")).toBe(false);
  });
});

describe("balances split by what online payment offers (never combined, never converted)", () => {
  it("offers a button only for currencies the backend listed; the rest stay payable at the store", () => {
    const r = splitDue([bal("HTG", 150000), bal("USD", 1850)], ["USD"]);
    expect(r.online.map((b) => b.currency)).toEqual(["USD"]);
    expect(r.atStoreOnly.map((b) => b.currency)).toEqual(["HTG"]);
  });
  it("ignores settled currencies and offers nothing when the list is empty", () => {
    expect(splitDue([bal("HTG", 0), bal("USD", 500)], ["HTG", "USD"]).online.map((b) => b.currency)).toEqual(["USD"]);
    const none = splitDue([bal("USD", 500)], []);
    expect(none.online).toEqual([]);
    expect(none.atStoreOnly).toHaveLength(1);
  });
});

describe("references and return paths", () => {
  it("recognises the API reference format only", () => {
    expect(isReferenceShape("ANA-K7M2QX")).toBe(true);
    expect(isReferenceShape(" ana-k7m2qx ")).toBe(true);
    expect(isReferenceShape("ANA-K7M2Q")).toBe(false);
    expect(isReferenceShape("../etc/passwd")).toBe(false);
    expect(isReferenceShape("ANA-K7M2Q1")).toBe(false); // 0 and 1 are never issued
  });
  it("builds a relative return path with encoded values", () => {
    expect(returnPath("ANA-K7M2QX", "a b")).toBe("/payment/return?reference=ANA-K7M2QX&attempt=a%20b");
  });
});
