#!/usr/bin/env node
/**
 * Soak test for a running Worker (OpenNext preview in workerd, or a deployed Worker): requests the storefront pages repeatedly for a given time, so cache entries age through their
 * stale-while-revalidate window and past their `expire`. The Cloudflare hang (docs/cloudflare-deployment.md, section 6) only appeared when a cached entry expired, minutes after the first
 * successful requests, so a smoke test that finishes in seconds cannot see it. Fails on any non-200, timeout or 5xx. Read-only GET requests.
 * Usage: node scripts/cf-soak.mjs https://<worker-host> [--minutes=7] [--every=10] [--timeout=20000]   (the default 7 minutes passes the 4-minute expire of the catalog cache)
 */
const base = (process.argv[2] ?? "").replace(/\/+$/, "");
const arg = (n, d) => Number((process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=")[1]) || d;
const MINUTES = arg("minutes", 7), EVERY = arg("every", 10), TIMEOUT = arg("timeout", 20000);
if (!/^https?:\/\//.test(base)) { console.error("Usage: node scripts/cf-soak.mjs <base-url> [--minutes=7] [--every=10] [--timeout=20000]"); process.exit(2); }
/** Behind Cloudflare Access (a protected development Worker): export CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (a service token); sent as the documented CF-Access-Client-* headers. */
const ACCESS = process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET } : {};
const paths = ["/fr", "/ht", "/fr/products", "/ht/products", "/fr/auth/login", "/ht/auth/sign-up", "/sitemap.xml", "/fr/products/produit-inexistant"];
const expected = (p) => (p === "/fr/products/produit-inexistant" ? 404 : 200);
const cookie = "NEXT_LOCALE=fr; sb-soak-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJub3QtYS1qd3QiLCJyZWZyZXNoX3Rva2VuIjoieCJ9";
const end = Date.now() + MINUTES * 60_000;
let requests = 0, failures = 0, slowest = 0;
console.log(`soak ${base} for ${MINUTES} min, every ${EVERY} s (${paths.length} pages, with and without cookies)`);
while (Date.now() < end) {
  const round = [];
  for (const p of paths) for (const withCookie of [false, true]) {
    const t0 = performance.now(); let status = 0;
    try { const r = await fetch(base + p, { redirect: "manual", headers: { ...ACCESS, ...(withCookie ? { Cookie: cookie } : {}) }, signal: AbortSignal.timeout(TIMEOUT) }); status = r.status; await r.arrayBuffer(); }
    catch (e) { status = e.name === "TimeoutError" ? -1 : -2; }
    const ms = Math.round(performance.now() - t0); slowest = Math.max(slowest, ms); requests++;
    if (status !== expected(p)) { failures++; round.push(`${p}${withCookie ? " (cookies)" : ""} -> ${status === -1 ? "HUNG" : status} ${ms}ms`); }
  }
  console.log(`${new Date().toTimeString().slice(0, 8)}  ${round.length ? "FAIL " + round.slice(0, 4).join(" | ") : "ok"}  (${requests} requests so far)`);
  await new Promise((r) => setTimeout(r, EVERY * 1000));
}
console.log(`\n${requests - failures}/${requests} requests as expected over ${MINUTES} min; slowest ${slowest} ms`);
process.exit(failures ? 1 : 0);
