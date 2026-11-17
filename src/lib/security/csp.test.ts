import { describe, expect, it } from "vitest";
import { assetOriginsOf, buildCsp, originOf } from "./csp";
import { PRIVATE_PAGE_SOURCES, securityHeaders, securityWarnings } from "./headers";

const base = { supabaseUrl: "https://abc.supabase.co/", apiBaseUrl: "https://api.example.com/base/path", assetOrigins: "https://img.example.com, https://cdn.example.com/x" };
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("originOf", () => {
  it("keeps only scheme://host[:port]", () => {
    expect(originOf("https://abc.supabase.co/auth/v1?x=1")).toBe("https://abc.supabase.co");
    expect(originOf("http://127.0.0.1:8080/x")).toBe("http://127.0.0.1:8080");
  });
  it("rejects anything that is not an http(s) URL", () => {
    for (const v of ["", undefined, "javascript:alert(1)", "data:text/html,x", "not a url", "ftp://x.test"]) expect(originOf(v)).toBeNull();
  });
  it("parses a list of asset origins, dropping junk and duplicates", () => {
    expect(assetOriginsOf("https://a.test, junk, https://a.test/path,*")).toEqual(["https://a.test"]);
  });
});

describe("buildCsp", () => {
  const csp = buildCsp(base);
  it("allows only the configured origins to be connected to (the asset origins too: the service worker fetches images)", () => {
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://abc.supabase.co https://api.example.com https://img.example.com https://cdn.example.com");
  });
  it("never opens connect-src wider than the configured origins, even without asset origins", () => {
    expect(directive(buildCsp({ ...base, assetOrigins: undefined }), "connect-src")).toBe("connect-src 'self' https://abc.supabase.co https://api.example.com");
  });
  it("allows images from the asset origins, data and blob only", () => {
    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob: https://img.example.com https://cdn.example.com");
  });
  it("closes the dangerous directives", () => {
    for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "frame-src 'none'", "worker-src 'self'", "manifest-src 'self'", "default-src 'self'"]) expect(csp).toContain(d);
  });
  it("never has a wildcard source or eval in production", () => {
    expect(csp).not.toMatch(/(^|[\s;])\*([\s;]|$)/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("ws:");
  });
  it("only development gets eval, websockets and loopback images", () => {
    const dev = buildCsp({ ...base, development: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(directive(dev, "img-src")).toContain("http://127.0.0.1:*");
  });
  it("falls back to https: images in production when no asset origin is configured", () => {
    expect(directive(buildCsp({ ...base, assetOrigins: "" }), "img-src")).toBe("img-src 'self' data: blob: https:");
  });
  it("upgrades insecure requests only for an HTTPS-only deployment", () => {
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(buildCsp({ ...base, httpsOnly: true })).toContain("upgrade-insecure-requests");
  });
  it("ignores a configured value that is not an http(s) URL (no injection through env)", () => {
    const evil = buildCsp({ supabaseUrl: "https://ok.test; script-src *", apiBaseUrl: "javascript:x", assetOrigins: "https://x.test; default-src *" });
    expect(evil.split(";").length).toBe(buildCsp({}).split(";").length);
    expect(evil).not.toContain("script-src *");
  });
});

describe("securityHeaders", () => {
  const all = (env: Record<string, string | undefined>) => Object.fromEntries(securityHeaders(env, false)[0].headers.map((h) => [h.key, h.value]));
  it("sets the baseline headers on every path", () => {
    const h = all(base as never);
    expect(securityHeaders({}, false)[0].source).toBe("/:path*");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Content-Security-Policy"]).toBeTruthy();
  });
  it("HSTS only when the deployment is HTTPS-only", () => {
    expect(all({})["Strict-Transport-Security"]).toBeUndefined();
    expect(all({ SECURITY_HTTPS_ONLY: "true" })["Strict-Transport-Security"]).toContain("max-age=63072000");
  });
  it("report-only mode renames the header instead of adding a second policy", () => {
    const h = all({ SECURITY_CSP_REPORT_ONLY: "1" });
    expect(h["Content-Security-Policy"]).toBeUndefined();
    expect(h["Content-Security-Policy-Report-Only"]).toBeTruthy();
  });
  it("private pages are never cached", () => {
    const rules = securityHeaders({}, false).slice(1);
    expect(rules.map((r) => r.source)).toEqual(PRIVATE_PAGE_SOURCES);
    for (const r of rules) expect(r.headers).toEqual([{ key: "Cache-Control", value: "private, no-store" }]);
    expect(PRIVATE_PAGE_SOURCES.join(" ")).toMatch(/admin.*account.*auth.*reservations.*payment/);
  });
  it("warns in production when no asset origin is configured", () => {
    expect(securityWarnings({ NODE_ENV: "production" })).toHaveLength(1);
    expect(securityWarnings({ NODE_ENV: "production", NEXT_PUBLIC_ASSET_ORIGINS: "https://i.test" })).toHaveLength(0);
  });
});
