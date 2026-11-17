import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogPathTarget, entryState, looksLikeSlug, resetEntryCache } from "./catalog-exists";

const res = (status: number) => ({ status, body: null }) as unknown as Response;

beforeEach(() => resetEntryCache());

describe("entryState", () => {
  it("answers exists / missing from the API status and caches both", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(404));
    const deps = { apiBaseUrl: "http://api", fetchImpl: f as unknown as typeof fetch, now: () => 1000 };
    expect(await entryState("products", "tee", deps)).toBe("exists");
    expect(await entryState("products", "tee", deps)).toBe("exists");
    expect(await entryState("categories", "nope", deps)).toBe("missing");
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][0]).toBe("http://api/api/v1/products/tee");
  });
  it("forgets a missing answer sooner than an existing one", async () => {
    let t = 0;
    const f = vi.fn().mockResolvedValue(res(404));
    const deps = { apiBaseUrl: "http://api", fetchImpl: f as unknown as typeof fetch, now: () => t };
    await entryState("products", "x", deps);
    t = 11_000;
    await entryState("products", "x", deps);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("never turns an API failure into a 404: unknown lets the page decide", async () => {
    const down = vi.fn().mockRejectedValue(new Error("down"));
    expect(await entryState("products", "tee", { apiBaseUrl: "http://api", fetchImpl: down as unknown as typeof fetch })).toBe("unknown");
    expect(await entryState("products", "tee2", { apiBaseUrl: "http://api", fetchImpl: vi.fn().mockResolvedValue(res(503)) as unknown as typeof fetch })).toBe("unknown");
    expect(await entryState("products", "tee3", { apiBaseUrl: undefined })).toBe("unknown");
  });
  it("does not ask the API about things that cannot be slugs", async () => {
    const f = vi.fn();
    const deps = { apiBaseUrl: "http://api", fetchImpl: f as unknown as typeof fetch };
    expect(await entryState("products", "a/../b", deps)).toBe("missing");
    expect(await entryState("products", "%E0%A4%A", deps)).toBe("missing");
    expect(await entryState("products", "x".repeat(300), deps)).toBe("missing");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("paths", () => {
  it("recognises only product and category detail paths", () => {
    expect(catalogPathTarget("/fr/products/tee")).toEqual({ locale: "fr", kind: "products", slug: "tee" });
    expect(catalogPathTarget("/ht/categories/maison/")).toEqual({ locale: "ht", kind: "categories", slug: "maison" });
    expect(catalogPathTarget("/fr/products")).toBeNull();
    expect(catalogPathTarget("/fr/products/a/b")).toBeNull();
    expect(catalogPathTarget("/fr/admin/products/x")).toBeNull();
  });
  it("slug shape", () => {
    expect(looksLikeSlug("tee-shirt-2")).toBe(true);
    expect(looksLikeSlug("-x")).toBe(false);
    expect(looksLikeSlug("a b")).toBe(false);
  });
});
