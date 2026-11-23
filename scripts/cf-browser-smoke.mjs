#!/usr/bin/env node
/**
 * Real-browser smoke test for a running Worker (OpenNext preview in workerd, or a deployed Worker): drives Chromium through the storefront and authentication screens the way a
 * visitor does, so the browser itself sends the RSC requests (`?_rsc=<hash>`, prefetches, client navigations) that hand-made HTTP requests cannot imitate. Fails on any response
 * with status >= 500, any failed/aborted-by-error request, a navigation that does not arrive, or no RSC request at all. Anonymous visitor only (no credentials);
 * the signed-in flows are `npm run e2e:auth-flows`. Read-only.
 * Usage: node scripts/cf-browser-smoke.mjs https://<worker-host>
 * Behind Cloudflare Access (a protected development Worker): export CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (a service token); they are sent as the documented
 * `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers. Chromium: CHROMIUM_PATH, or the Playwright cache (~/.cache/ms-playwright).
 */
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) { console.error("Usage: node scripts/cf-browser-smoke.mjs <base-url>"); process.exit(2); }
const pw = os.homedir() + "/.cache/ms-playwright";
const exe = process.env.CHROMIUM_PATH ?? `${pw}/${fs.readdirSync(pw).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
const headers = process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET } : {};
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
let failures = 0, rscTotal = 0, requests = 0;
const check = (name, ok, extra = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${String(extra).slice(0, 200)}]` : ""}`); };

for (const [vp, width, height] of [["390px", 390, 844], ["1280px", 1280, 800]]) for (const loc of ["fr", "ht"]) {
  const ctx = await browser.newContext({ viewport: { width, height }, extraHTTPHeaders: headers });
  const page = await ctx.newPage();
  const rsc = [], bad = [];
  page.on("response", (r) => {
    requests++;
    const url = new URL(r.url());
    if (url.origin !== new URL(base).origin) return;
    if (url.searchParams.has("_rsc")) rsc.push({ path: url.pathname, status: r.status() });
    if (r.status() >= 500) bad.push(`${r.status()} ${url.pathname}${url.search}`.slice(0, 120));
  });
  page.on("pageerror", (e) => bad.push(`PAGE ERROR ${e.message.slice(0, 80)}`));
  page.on("requestfailed", (r) => { const u = new URL(r.url()); if (u.origin === new URL(base).origin && !/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) bad.push(`FAILED ${r.failure()?.errorText} ${u.pathname}`); });
  const label = `${loc} ${vp}`;
  const t0 = Date.now();
  const home = await page.goto(`${base}/${loc}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  check(`${label}: home page loads`, home?.status() === 200, `${home?.status()} in ${Date.now() - t0} ms`);
  await page.mouse.wheel(0, 2500); await page.waitForTimeout(1200); // links entering the viewport are prefetched by Next
  const hrefs = await page.$$eval(`a[href^="/${loc}/"]`, (as) => [...new Set(as.map((a) => a.getAttribute("href")))].filter((h) => !/[?#]/.test(h) && !/\/(admin|account)(\/|$)/.test(h)).slice(0, 9));
  check(`${label}: internal links found`, hrefs.length >= 3, `${hrefs.length} links`);
  for (const h of hrefs) {
    const link = page.locator(`a[href="${h}"]:visible`).first();
    if (!(await link.count())) continue;
    await link.scrollIntoViewIfNeeded().catch(() => {});
    await link.click({ timeout: 8000 }).catch(() => {});
    await page.waitForURL((u) => u.pathname === h.split("?")[0], { timeout: 10000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    const arrived = new URL(page.url()).pathname === h && (await page.locator("main, body").first().innerText()).length > 20;
    check(`${label}: client navigation to ${h}`, arrived, page.url());
    await page.goBack().catch(() => {}); await page.waitForLoadState("networkidle").catch(() => {});
  }
  await page.waitForTimeout(800);
  check(`${label}: the browser sent RSC requests (prefetch/navigation)`, rsc.length > 0, `${rsc.length} requests with ?_rsc=`);
  check(`${label}: every RSC response is 2xx/3xx`, rsc.every((r) => r.status < 400), rsc.filter((r) => r.status >= 400).map((r) => `${r.status} ${r.path}`).join(", "));
  check(`${label}: no 5xx and no failed request`, bad.length === 0, bad.slice(0, 3).join(" | "));
  rscTotal += rsc.length;
  await ctx.close();
}
await browser.close();
console.log(`\n${failures ? failures + " FAILED" : "all passed"}; ${rscTotal} RSC responses observed, ${requests} responses in total`);
process.exit(failures ? 1 : 0);
