import { describe, expect, it } from "vitest";
import { DISMISS_MS, MIN_VISITS, isIosSafari, isQuietPath, parseCount, parseStamp, shouldOfferInstall } from "./install";

const base = { visits: MIN_VISITS, dismissedAt: null, now: 1_000_000_000_000, standalone: false, pathname: "/fr/products" };

describe("install guidance", () => {
  it("is not offered on the first visit, when installed, or during a task", () => {
    expect(shouldOfferInstall({ ...base, visits: 1 })).toBe(false);
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
    for (const p of ["/fr/reserve", "/ht/reservations/ANA-1", "/fr/auth/login", "/fr/admin", "/ht/account/profile"]) expect(shouldOfferInstall({ ...base, pathname: p })).toBe(false);
    expect(isQuietPath("/fr/cart")).toBe(false);
  });
  it("comes back only after the quiet period following 'not now'", () => {
    expect(shouldOfferInstall(base)).toBe(true);
    expect(shouldOfferInstall({ ...base, dismissedAt: base.now - 1000 })).toBe(false);
    expect(shouldOfferInstall({ ...base, dismissedAt: base.now - DISMISS_MS - 1 })).toBe(true);
  });
  it("recognises iPhone and iPad Safari, not other iOS browsers or Android", () => {
    const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(isIosSafari(safari)).toBe(true);
    expect(isIosSafari(safari.replace("Version/17.0", "CriOS/120") )).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36")).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", 5, "MacIntel")).toBe(true); // iPadOS
    expect(isIosSafari("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", 0, "MacIntel")).toBe(false);
  });
  it("parses stored values defensively", () => {
    expect(parseCount(null)).toBe(0);
    expect(parseCount("abc")).toBe(0);
    expect(parseCount("3")).toBe(3);
    expect(parseStamp(null)).toBeNull();
    expect(parseStamp("x")).toBeNull();
    expect(parseStamp("123")).toBe(123);
  });
});
