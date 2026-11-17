import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type * as Policy from "./policy";

// policy.js is a classic script (it is concatenated into the service worker), so load it the way Node loads a CommonJS file.
const P = createRequire(import.meta.url)("./policy.js") as typeof Policy;

const ORIGIN = "https://shop.example";
const API = "https://api.example";
const base = { method: "GET", mode: "cors", destination: "", origin: ORIGIN, apiOrigin: API, assetOrigins: ["https://img.example"] };
const classify = (url: string, extra: Partial<Policy.ClassifyInput> = {}) => P.classify({ ...base, url, ...extra });
const nav = (path: string) => classify(`${ORIGIN}${path}`, { mode: "navigate", destination: "document" });

describe("classify: what the worker may touch", () => {
  it("keeps hashed build assets and the offline notice", () => {
    expect(classify(`${ORIGIN}/_next/static/chunks/a-1.js`)).toBe("static");
    expect(classify(`${ORIGIN}/offline.html`)).toBe("shell");
  });

  it("serves public storefront pages from the saved copy only for an allow-list of paths", () => {
    for (const p of ["/", "/fr", "/ht", "/fr/products", "/fr/products/clou-acier", "/ht/cart", "/fr/search", "/fr/info/privacy"]) expect(nav(p)).toBe("page");
  });

  it("treats every private or transactional navigation as live-only (never cached)", () => {
    for (const p of ["/fr/admin", "/fr/admin/products/1", "/ht/account", "/fr/account/profile", "/fr/auth/login", "/fr/auth/callback", "/fr/reserve", "/fr/reserve/confirmation/ANA-1", "/fr/reservations", "/ht/reservations/ANA-1", "/fr/payment/return", "/ht/payment/cancelled"]) {
      expect(nav(p)).toBe("private-page");
    }
  });

  it("treats an unknown page as private (safe by default)", () => {
    expect(nav("/fr/something-new")).toBe("private-page");
    expect(nav("/fr/products/a/b")).toBe("private-page");
  });

  it("only caches the public catalog endpoints of the API", () => {
    for (const p of ["/api/v1/products", "/api/v1/products/search", "/api/v1/products/clou-acier", "/api/v1/categories", "/api/v1/categories/maison", "/api/v1/store/pickup"]) {
      expect(classify(`${API}${p}`)).toBe("api");
    }
    for (const p of ["/api/v1/admin/products", "/api/v1/admin/reports/overview", "/api/v1/me", "/api/v1/me/reservations", "/api/v1/reservations", "/api/v1/reservations/lookup", "/api/v1/uploads", "/actuator/health"]) {
      expect(classify(`${API}${p}`)).toBe("bypass");
    }
  });

  it("never touches a request that carries credentials, a write, or a range", () => {
    expect(classify(`${API}/api/v1/products`, { hasAuthorization: true })).toBe("bypass");
    expect(classify(`${API}/api/v1/me`, { hasAuthorization: true })).toBe("bypass");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(classify(`${API}/api/v1/reservations`, { method })).toBe("bypass");
      expect(classify(`${API}/api/v1/products`, { method })).toBe("bypass");
      expect(classify(`${ORIGIN}/fr/cart`, { method, mode: "navigate" })).toBe("bypass");
    }
    expect(classify(`${ORIGIN}/_next/static/a.js`, { hasRange: true })).toBe("bypass");
  });

  it("never touches Supabase or any other third-party origin", () => {
    expect(classify("https://abc.supabase.co/auth/v1/token?grant_type=password")).toBe("bypass");
    expect(classify("https://abc.supabase.co/auth/v1/user", { hasAuthorization: true })).toBe("bypass");
    expect(classify("https://cdn.other/lib.js", { destination: "script" })).toBe("bypass");
  });

  it("never touches RSC payloads, prefetches, same-origin fetch() or the worker itself", () => {
    expect(classify(`${ORIGIN}/fr/products?_rsc=abc`)).toBe("bypass");
    expect(classify(`${ORIGIN}/fr/admin?_rsc=abc`)).toBe("bypass");
    expect(classify(`${ORIGIN}/api/anything`)).toBe("bypass");
    expect(classify(`${ORIGIN}/sw.js`)).toBe("bypass");
    expect(classify(`${ORIGIN}/_next/data/x.json`)).toBe("bypass");
  });

  it("stale-while-revalidates images from the configured asset host only", () => {
    expect(classify("https://img.example/p/1.webp", { destination: "image" })).toBe("image");
    expect(classify("https://evil.example/p/1.webp", { destination: "image" })).toBe("bypass");
    expect(classify(`${ORIGIN}/_next/image?url=%2Fa.png&w=640&q=75`, { destination: "image" })).toBe("image");
    expect(classify(`${ORIGIN}/icons/icon-192.png`, { destination: "image" })).toBe("image");
  });

  it("any asset host is allowed for images when none is configured, but never for scripts", () => {
    expect(classify("https://any.example/a.png", { destination: "image", assetOrigins: [] })).toBe("image");
    expect(classify("https://any.example/a.js", { destination: "script", assetOrigins: [] })).toBe("bypass");
  });

  it("ignores non-http schemes and malformed URLs", () => {
    expect(classify("chrome-extension://abc/x.js")).toBe("bypass");
    expect(classify("not a url")).toBe("bypass");
  });
});

describe("isCacheable: what may be stored", () => {
  const ok = { status: 200, type: "basic", redirected: false, cacheControl: null };
  it("never stores bypassed or private requests, whatever the response says", () => {
    expect(P.isCacheable({ kind: "bypass", ...ok })).toBe(false);
    expect(P.isCacheable({ kind: "private-page", ...ok })).toBe(false);
  });
  it("stores only real 200 answers for pages and catalog data", () => {
    expect(P.isCacheable({ kind: "page", ...ok })).toBe(true);
    expect(P.isCacheable({ kind: "page", ...ok, status: 404 })).toBe(false);
    expect(P.isCacheable({ kind: "page", ...ok, status: 503 })).toBe(false);
    expect(P.isCacheable({ kind: "page", ...ok, redirected: true })).toBe(false);
    expect(P.isCacheable({ kind: "page", ...ok, type: "opaque" })).toBe(false);
    expect(P.isCacheable({ kind: "api", ...ok })).toBe(true);
    expect(P.isCacheable({ kind: "api", ...ok, status: 401 })).toBe(false);
    expect(P.isCacheable({ kind: "api", ...ok, status: 429 })).toBe(false);
    expect(P.isCacheable({ kind: "api", ...ok, type: "opaque" })).toBe(false);
  });
  it("does not store a hashed asset the server marked no-store", () => {
    expect(P.isCacheable({ kind: "static", ...ok })).toBe(true);
    expect(P.isCacheable({ kind: "static", ...ok, cacheControl: "no-store" })).toBe(false);
  });
  it("accepts opaque images (cannot be inspected, are only ever drawn) but not image errors", () => {
    expect(P.isCacheable({ kind: "image", ...ok, type: "opaque", status: 0 })).toBe(true);
    expect(P.isCacheable({ kind: "image", ...ok, status: 500 })).toBe(false);
  });
});

describe("cache versions and isolation", () => {
  it("names caches per version and kind", () => {
    expect(P.cacheName("v7", "pages")).toBe("ana-v7-pages");
  });
  it("deletes only this app's caches of OTHER versions", () => {
    expect(P.isObsoleteCache("ana-v6-pages", "v7")).toBe(true);
    expect(P.isObsoleteCache("ana-v7-pages", "v7")).toBe(false);
    expect(P.isObsoleteCache("ana-v70-pages", "v7")).toBe(true); // prefix of the version is not the version
    expect(P.isObsoleteCache("someone-else", "v7")).toBe(false);
  });
  it("purges the page and catalog caches when a session ends", () => {
    expect(P.purgeNames("v7")).toEqual(["ana-v7-pages", "ana-v7-api"]);
  });
  it("refuses catalog data older than 24 hours or without a timestamp", () => {
    const now = 10 * 24 * 3600 * 1000;
    expect(P.isTooOld(now - 3600_000, now)).toBe(false);
    expect(P.isTooOld(now - 25 * 3600_000, now)).toBe(true);
    expect(P.isTooOld(NaN, now)).toBe(true);
    expect(P.isTooOld(undefined, now)).toBe(true);
  });
});

describe("offline fallbacks", () => {
  it("a locale page falls back only to itself, without its fragment", () => {
    expect(P.fallbackKeys(`${ORIGIN}/fr/products?q=a#top`)).toEqual([`${ORIGIN}/fr/products?q=a`]);
  });
  it("a bare path tries the visitor's language first", () => {
    expect(P.fallbackKeys(`${ORIGIN}/`, "ht-HT,ht;q=0.9")).toEqual([`${ORIGIN}/ht`, `${ORIGIN}/fr`]);
    expect(P.fallbackKeys(`${ORIGIN}/cart`, "fr-FR,fr;q=0.9,ht;q=0.5")).toEqual([`${ORIGIN}/fr/cart`, `${ORIGIN}/ht/cart`]);
    expect(P.fallbackKeys(`${ORIGIN}/`, null)[0]).toBe(`${ORIGIN}/fr`);
  });
  it("finds the hashed assets a page references", () => {
    const html = '<script src="/_next/static/chunks/a-1.js"></script><link href="/_next/static/css/b.css"><script src="/_next/static/chunks/a-1.js"></script><a href="/x.js">';
    expect(P.extractStaticUrls(html)).toEqual(["/_next/static/chunks/a-1.js", "/_next/static/css/b.css"]);
  });
});
