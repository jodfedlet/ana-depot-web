/**
 * Browser check of the "authentication unavailable" state. Build and start the app with a MISSING or INVALID Supabase configuration, e.g.
 *   (no NEXT_PUBLIC_SUPABASE_* at all)   or   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=not-a-key
 * (NEXT_PUBLIC_* are inlined at build time, so each configuration needs its own build), then `npm run e2e:unavailable`.
 * A key that looks like a SECRET does not even build (next.config.ts refuses it).
 */
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const base = `${os.homedir()}/.cache/ms-playwright`;
const exe = process.env.CHROMIUM_PATH ?? `${base}/${fs.readdirSync(base).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  CONFIG-UNAVAILABLE: ${n}${x ? `  [${x}]` : ""}`); };
const title = { fr: "Connexion indisponible", ht: "Koneksyon pa disponib" };
const requests = [];
for (const loc of ["fr", "ht"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("request", (r) => { if (/\/auth\/v1\//.test(r.url())) requests.push(r.url()); });
  for (const p of ["login", "sign-up", "sign-up-success", "forgot-password", "update-password"]) {
    await page.goto(`${WEB}/${loc}/auth/${p}`); await page.waitForLoadState("networkidle");
    const main = page.locator("main");
    check(`/${loc}/auth/${p}: localized unavailable state, no inputs, no form`, (await main.getByText(title[loc]).count()) === 1 && (await main.locator("input, form, textarea").count()) === 0);
  }
  await page.goto(`${WEB}/${loc}/admin`); await page.waitForLoadState("networkidle");
  check(`/${loc}/admin: no staff access and no sign-in inputs when auth is not configured`, new URL(page.url()).pathname === `/${loc}/admin` && (await page.locator("input, form").count()) === 0 && !/Tableau de bord|Tablo bò/.test(await page.locator("body").innerText()));
  await ctx.close();
}
check("no request to any Supabase Auth endpoint was made", requests.length === 0, requests.join(","));
console.log(`\n${results.filter(Boolean).length} passed, ${results.filter((x) => !x).length} failed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
