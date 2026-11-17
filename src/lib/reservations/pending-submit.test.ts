import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetAccess, normalizeReference, recallAccess, rememberAccess } from "./access-store";
import { clearPending, hasPending, keyFor } from "./pending-submit";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => void m.delete(k), setItem: (k, v) => void m.set(k, v) };
}
beforeEach(() => vi.stubGlobal("window", { sessionStorage: memoryStorage() }));
afterEach(() => vi.unstubAllGlobals());

describe("idempotency key bookkeeping for 'send the reservation'", () => {
  it("the SAME request reuses its key (a retry after a timeout cannot create a second reservation)", () => {
    let n = 0;
    const next = () => `key-${++n}`;
    expect(keyFor("request-A", next)).toBe("key-1");
    expect(keyFor("request-A", next)).toBe("key-1");
    expect(hasPending()).toBe(true);
  });
  it("a CHANGED request gets a new key (the server refuses one key with two different bodies)", () => {
    let n = 0;
    const next = () => `key-${++n}`;
    expect(keyFor("request-A", next)).toBe("key-1");
    expect(keyFor("request-B", next)).toBe("key-2");
  });
  it("after a definite answer the next attempt is a new request with a new key", () => {
    let n = 0;
    const next = () => `key-${++n}`;
    keyFor("request-A", next);
    clearPending();
    expect(hasPending()).toBe(false);
    expect(keyFor("request-A", next)).toBe("key-2");
  });
  it("survives without storage (a blocked sessionStorage only loses the remembered key)", () => {
    vi.stubGlobal("window", { sessionStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } } });
    expect(keyFor("x", () => "k")).toBe("k");
    expect(() => clearPending()).not.toThrow();
  });
});

describe("guest access (reference + phone) kept for this tab only", () => {
  it("remembers by normalized reference and can forget a wrong phone", () => {
    rememberAccess("ana-k7m2qx ", "+509 3700 0000");
    expect(recallAccess("ANA-K7M2QX")).toBe("+509 3700 0000");
    expect(recallAccess("ANA-OTHER1")).toBeUndefined();
    forgetAccess("ana-k7m2qx");
    expect(recallAccess("ANA-K7M2QX")).toBeUndefined();
    expect(normalizeReference(" ana k7m2qx")).toBe("ANAK7M2QX");
  });
  it("stores the phone only under sessionStorage, never in localStorage", () => {
    const local = memoryStorage();
    vi.stubGlobal("window", { sessionStorage: memoryStorage(), localStorage: local });
    rememberAccess("ANA-1", "37000000");
    expect(local.length).toBe(0);
  });
});
