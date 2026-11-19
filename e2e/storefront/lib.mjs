/**
 * Shared helpers for the storefront browser suite. LOCAL-STACK verification: the real Spring Boot API, a LOCAL Supabase stack (real GoTrue + Mailpit)
 * and an S3-compatible store (MinIO) — NOT a hosted Supabase project and NOT Cloudflare R2.
 */
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";

import { TargetRefused, assertDedicatedTestTarget } from "../../scripts/e2e-target-guard.mjs";

// These suites CREATE users, reservations, payments and stock movements. They run only against a target the guard can positively identify as a dedicated local test target:
// every URL explicit (no default ports), the target confirmed (E2E_TARGET_CONFIRM = API_URL), loopback, and a store that is fresh or carries the seed's own name.
try { await assertDedicatedTestTarget({ needWeb: true }); } catch (e) {
  console.error(e instanceof TargetRefused ? `${e.message}\n(see scripts/e2e-target-guard.mjs and e2e/storefront/README.md)` : String(e));
  process.exit(2);
}
export const env = {
  WEB: process.env.WEB_URL,
  API: process.env.API_URL,
  SB: process.env.SUPABASE_URL,
  KEY: process.env.SUPABASE_PUBLIC_KEY,
  MAIL: process.env.MAIL_URL ?? "http://127.0.0.1:54324",
  STAFF_EMAIL: process.env.STAFF_EMAIL,
  STAFF_PASSWORD: process.env.STAFF_PASSWORD,
  SHOTS: process.env.SHOTS_DIR ?? "e2e/storefront/screenshots",
  TERMS: process.env.NEXT_PUBLIC_TERMS_VERSION ?? "verification-2026-11-17",
};
if (!env.KEY || !env.STAFF_EMAIL || !env.STAFF_PASSWORD) {
  console.error("Set SUPABASE_PUBLIC_KEY, STAFF_EMAIL and STAFF_PASSWORD (see e2e/storefront/README.md).");
  process.exit(2);
}
fs.mkdirSync(env.SHOTS, { recursive: true });

export const results = [];
export const check = (name, ok, extra = "") => {
  results.push({ ok: !!ok, name, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra !== "" ? `  [${String(extra).replace(/\s+/g, " ").slice(0, 200)}]` : ""}`);
};
export const section = (title) => console.log(`\n== ${title}`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = `${os.homedir()}/.cache/ms-playwright`;
  const dir = fs.readdirSync(base).find((d) => d.startsWith("chromium-"));
  return `${base}/${dir}/chrome-linux64/chrome`;
}
export const launch = () => chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });

export const pageErrors = [];
export async function newPage(browser, { width = 1280, height = 900, serviceWorkers = "allow" } = {}) {
  // `serviceWorkers: "block"` for tests that FAKE network answers with `page.route`: the app's service worker (PWA) would otherwise fetch from the API itself, out of the route's sight
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "warning" && /\[i18n\]/.test(m.text())) pageErrors.push(`i18n ${page.url()}: ${m.text().slice(0, 160)}`);
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) pageErrors.push(`console ${page.url()}: ${m.text().slice(0, 160)}`);
  });
  return { ctx, page };
}
export const bodyText = (page) => page.locator("body").innerText().then((t) => t.replace(/[  ]/g, " "));
export const shot = (page, name) => page.screenshot({ path: `${env.SHOTS}/${name}.png`, fullPage: true });
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Waits for the app to settle after client-side API calls. */
export async function settle(page, ms = 700) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(ms);
}

// ------------- staff API (real, with a real Supabase staff token) -------------
let staffToken = null;
export async function staff() {
  if (!staffToken) {
    const r = await fetch(`${env.SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: env.STAFF_EMAIL, password: env.STAFF_PASSWORD }) });
    staffToken = (await r.json()).access_token;
  }
  return staffToken;
}
export async function admin(method, path, body, headers = {}) {
  const r = await fetch(`${env.API}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${await staff()}`, "Content-Type": "application/json", Accept: "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, body: json };
}
export const key = () => ({ "Idempotency-Key": crypto.randomUUID() });
export const publicApi = async (path) => (await fetch(`${env.API}/api/v1${path}`)).json();

export async function productBySlug(slug) { return publicApi(`/products/${slug}`); }
export async function adminProduct(id) { return (await admin("GET", `/admin/products/${id}`)).body; }
export async function stockOf(productId) { return (await adminProduct(productId)).stock; }

export async function mailFor(to, subjectPart, after = 0, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const list = await (await fetch(`${env.MAIL}/api/v1/messages`)).json();
    const m = list.messages.find((x) => x.To.some((a) => a.Address === to) && x.Subject.includes(subjectPart) && new Date(x.Created).getTime() >= after);
    if (m) return (await fetch(`${env.MAIL}/api/v1/message/${m.ID}`)).json();
    await sleep(500);
  }
  return null;
}
export const linkOf = (mail) => mail.HTML.match(/href="([^"]*)"/)[1].replace(/&amp;/g, "&");

/** A French-formatted amount as the UI prints it ("1 500,00 HTG"), tolerant of NBSP. */
export const money = (major, cur) => `${new Intl.NumberFormat("fr-HT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(major).replace(/[  ]/g, " ")} ${cur}`;
export const uniqPhone = () => `3${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

/** A tiny valid PNG (solid colour) written to `path`: used to exercise the real image upload flow. */
export async function makePng(path, rgb = [200, 60, 50], size = 64) {
  const { deflateSync, crc32 } = await import("node:zlib");
  const raw = Buffer.concat(Array.from({ length: size }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())])));
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([len, body, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
  return path;
}
