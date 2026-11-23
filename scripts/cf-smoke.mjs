#!/usr/bin/env node
/**
 * HTTP smoke matrix for a running Worker (OpenNext preview in workerd, or a deployed Worker). It fails on ANY 5xx, timeout (a hung Worker never answers) or
 * unexpected status, for plain requests with and without cookies and for the static files. RSC requests are NOT forged here (Next rejects a hand-made router-state header
 * with 500 "could not be parsed"): the browser's own `?_rsc=` requests are exercised by scripts/cf-browser-smoke.mjs. Read-only: GET/HEAD only. Usage: node scripts/cf-smoke.mjs https://<worker-host> [--rounds=3] [--timeout=20000]
 * Exit 0 = every request answered as expected. It does not sign in (no credentials); authenticated flows are covered by e2e/real-supabase/auth-flows.mjs.
 */
const base = (process.argv[2] ?? "").replace(/\/+$/, "");
const arg = (name, d) => Number((process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=")[1] ?? d) || d;
const ROUNDS = arg("rounds", 3);
const TIMEOUT = arg("timeout", 20000);
if (!/^https?:\/\//.test(base)) { console.error("Usage: node scripts/cf-smoke.mjs <base-url> [--rounds=3] [--timeout=20000]"); process.exit(2); }

const COOKIE = "NEXT_LOCALE=fr; sb-smoke-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJub3QtYS1qd3QiLCJyZWZyZXNoX3Rva2VuIjoieCJ9";

/** [label, path, expected status(es), headers, redirect location prefix?] */
const pages = [
  ["/", "/", [307], {}, "/fr"],
  ["/fr", "/fr", [200]], ["/ht", "/ht", [200]],
  ["/fr/products", "/fr/products", [200]], ["/ht/products", "/ht/products", [200]],
  ["/fr/search", "/fr/search", [200]], ["/fr/cart", "/fr/cart", [200]], ["/fr/reserve", "/fr/reserve", [200]], ["/fr/info/terms", "/fr/info/terms", [200]],
  ["/fr/auth/login", "/fr/auth/login", [200]], ["/ht/auth/login", "/ht/auth/login", [200]],
  ["/fr/auth/sign-up", "/fr/auth/sign-up", [200]], ["/ht/auth/sign-up", "/ht/auth/sign-up", [200]],
  ["/fr/auth/forgot-password", "/fr/auth/forgot-password", [200]],
  ["/fr/admin", "/fr/admin", [200, 307]], ["/fr/account", "/fr/account", [200, 307]],
  ["unknown product", "/fr/products/produit-inexistant-xyz", [404]], ["unknown category", "/fr/categories/inexistante-xyz", [404]],
];
const statics = ["/sw.js", "/manifest.webmanifest", "/robots.txt", "/sitemap.xml", "/offline.html", "/icons/icon-192.png", "/sample/placeholder.svg"];

/** Behind Cloudflare Access (a protected development Worker): export CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (a service token); sent as the documented CF-Access-Client-* headers. */
const ACCESS = process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET } : {};
const rows = [];
async function hit(label, path, expected, headers = {}, locationPrefix) {
  const t0 = performance.now();
  let status = 0, note = "";
  try {
    const res = await fetch(base + path, { headers: { ...ACCESS, ...headers }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT) });
    status = res.status;
    await res.arrayBuffer();
    if (locationPrefix && !(res.headers.get("location") ?? "").startsWith(locationPrefix)) note = `location=${res.headers.get("location")}`;
  } catch (e) { note = e.name === "TimeoutError" ? `HUNG (> ${TIMEOUT} ms)` : `${e.name}: ${e.message}`; }
  const ms = Math.round(performance.now() - t0);
  const ok = expected.includes(status) && !note;
  rows.push({ ok, label, path, status, ms, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${String(status).padStart(3)}  ${String(ms).padStart(5)} ms  ${label}${note ? "  [" + note + "]" : ""}`);
}

for (let round = 1; round <= ROUNDS; round++) {
  console.log(`\n--- round ${round}/${ROUNDS} ---`);
  for (const [name, path, expected, headers = {}, loc] of pages) {
    await hit(`${name} (plain)`, path, expected, headers, loc);
    if (expected.includes(200)) {
      await hit(`${name} (cookies)`, path, expected, { ...headers, Cookie: COOKIE });
    }
  }
  for (const p of statics) await hit(`static ${p}`, p, [200]);
  await hit("POST-free check: /api/revalidate-catalog without token (GET => 405)", "/api/revalidate-catalog", [405]);
}
const failed = rows.filter((r) => !r.ok);
const slow = rows.filter((r) => r.ms > 3000 && r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} requests as expected; ${failed.length} failed; ${slow.length} slower than 3 s`);
if (failed.length) for (const f of failed.slice(0, 20)) console.log(`  FAIL ${f.status} ${f.label} ${f.note}`);
process.exit(failed.length ? 1 : 0);
