import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attemptKey, endAttempt } from "./idempotency";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => void m.delete(k), setItem: (k, v) => void m.set(k, v) };
}
beforeEach(() => vi.stubGlobal("window", { sessionStorage: memoryStorage() }));
afterEach(() => { endAttempt("payment:r1"); endAttempt("payment:r2"); vi.unstubAllGlobals(); });

describe("idempotency keys for staff writes", () => {
  it("the SAME request reuses its key (a retry after a lost answer cannot double-apply)", () => {
    let n = 0;
    const mint = () => `k${++n}`;
    expect(attemptKey("payment:r1", { amount: "10.00", currency: "HTG" }, mint)).toBe("k1");
    expect(attemptKey("payment:r1", { amount: "10.00", currency: "HTG" }, mint)).toBe("k1");
  });
  it("a changed request gets a new key; scopes are independent", () => {
    let n = 0;
    const mint = () => `k${++n}`;
    expect(attemptKey("payment:r1", { amount: "10.00" }, mint)).toBe("k1");
    expect(attemptKey("payment:r1", { amount: "11.00" }, mint)).toBe("k2");
    expect(attemptKey("payment:r2", { amount: "11.00" }, mint)).toBe("k3");
  });
  it("a definite answer ends the attempt: the next identical request is a NEW request", () => {
    let n = 0;
    const mint = () => `k${++n}`;
    attemptKey("payment:r1", { a: 1 }, mint);
    endAttempt("payment:r1");
    expect(attemptKey("payment:r1", { a: 1 }, mint)).toBe("k2");
  });
  it("still works when sessionStorage is blocked", () => {
    vi.stubGlobal("window", { sessionStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } } });
    expect(attemptKey("payment:r1", { a: 1 }, () => "kx")).toBe("kx");
    expect(attemptKey("payment:r1", { a: 1 }, () => "ky")).toBe("kx");
  });
});
