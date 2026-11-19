#!/usr/bin/env node
/**
 * Measures response time of the real API and the built web app against the 1-second target (p95 per route). LOCAL measurement on whatever stack the URLs point at:
 * it says nothing about a hosted deployment, a mobile network or a cold start. Sequential requests, warm-up discarded, no secrets printed.
 *
 *   WEB_URL=... API_URL=... E2E_TARGET_CONFIRM=<API_URL> SUPABASE_URL=... SUPABASE_PUBLIC_KEY=... STAFF_EMAIL=... STAFF_PASSWORD=... node scripts/measure-latency.mjs [samples=30]
 * Read probes: catalog listing, product detail, search, categories, pickup, payment options, admin lists, reports, web pages. Write probes (complete HTTP operations, each sample is a NEW reservation):
 * reservation submission, tracking lookup, and the staff operations accept / ready / record cash payment / collect.
 *
 * Exit 0 = every route's p95 is at most TARGET_MS (default 1000); 1 = at least one is slower.
 */
import { TargetRefused, assertDedicatedTestTarget } from "./e2e-target-guard.mjs";

// This script CREATES reservations and payments (the write probes), so it only runs against a dedicated local test target (see scripts/e2e-target-guard.mjs).
try { await assertDedicatedTestTarget({ needWeb: true }); } catch (e) { console.error(e instanceof TargetRefused ? e.message : String(e)); process.exit(2); }
const WEB = process.env.WEB_URL;
const API = process.env.API_URL;
const SB = process.env.SUPABASE_URL;
const TARGET = Number(process.env.TARGET_MS ?? 1000);
const N = Number(process.argv[2] ?? 30);

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
async function time(url, init) {
  const t0 = performance.now();
  const res = await fetch(url, init);
  await res.arrayBuffer();
  return { ms: performance.now() - t0, status: res.status };
}
async function probe(label, url, init, expect = [200]) {
  await time(url, init);                               // warm-up (JIT, connection pool, caches)
  const samples = [];
  let bad = 0;
  for (let i = 0; i < N; i++) { const r = await time(url, init); samples.push(r.ms); if (!expect.includes(r.status)) bad++; }
  samples.sort((a, b) => a - b);
  return { label, p50: pct(samples, 50), p95: pct(samples, 95), max: samples[samples.length - 1], bad };
}

let token = null;
if (process.env.STAFF_EMAIL && process.env.SUPABASE_PUBLIC_KEY) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: process.env.SUPABASE_PUBLIC_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env.STAFF_EMAIL, password: process.env.STAFF_PASSWORD }) });
  token = (await r.json()).access_token ?? null;
}
const staff = token ? { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } } : null;
const json = (u) => fetch(u).then((r) => r.json());
const products = (await json(`${API}/api/v1/products?size=20`)).items ?? [];
const slug = products[0]?.slug;
const cats = await json(`${API}/api/v1/categories`);
const catSlug = (Array.isArray(cats) ? cats : cats.items ?? [])[0]?.slug;
const ref = staff ? (await (await fetch(`${API}/api/v1/admin/reservations?size=1`, staff)).json()).items?.[0]?.id : null;

const rows = [];
const api = (l, p, init, ex) => probe(`API  ${l}`, `${API}${p}`, init, ex).then((r) => rows.push(r));
const web = (l, p) => probe(`WEB  ${l}`, `${WEB}${p}`, { redirect: "manual" }, [200, 307]).then((r) => rows.push(r));

await api("GET /products?size=20", "/api/v1/products?size=20");
await api("GET /products (filters)", "/api/v1/products?size=20&inStock=true&sort=newest");
await api("GET /products/search?q=", "/api/v1/products/search?q=tube&size=20");
await api("GET /products/{slug}", `/api/v1/products/${slug}`);
await api("GET /categories", "/api/v1/categories");
await api("GET /categories/{slug}", `/api/v1/categories/${catSlug}`);
await api("GET /store/pickup", "/api/v1/store/pickup");
await api("GET /store/payment-options", "/api/v1/store/payment-options");
if (staff) {
  await api("admin GET /reservations", "/api/v1/admin/reservations?size=20", staff);
  await api("admin GET /reservations/{id}", `/api/v1/admin/reservations/${ref}`, staff);
  await api("admin GET /products", "/api/v1/admin/products?size=20", staff);
  await api("admin GET /inventory", "/api/v1/admin/inventory?size=20", staff);
  await api("admin GET /payments", "/api/v1/admin/payments?size=20", staff);
  await api("admin GET /customers", "/api/v1/admin/customers?size=20", staff);
  await api("admin GET /reports/overview", "/api/v1/admin/reports/overview", staff);
  await api("admin GET /reports/payments", "/api/v1/admin/reports/payments", staff);
  await api("admin GET /staff", "/api/v1/admin/staff", staff, [200, 403]);
}
for (const lang of ["fr", "ht"]) {
  await web(`/${lang} (home)`, `/${lang}`);
  await web(`/${lang}/products`, `/${lang}/products`);
  await web(`/${lang}/products/{slug}`, `/${lang}/products/${slug}`);
  await web(`/${lang}/categories/{slug}`, `/${lang}/categories/${catSlug}`);
  await web(`/${lang}/cart`, `/${lang}/cart`);
}
await web("/sitemap.xml", "/sitemap.xml");

// ---- write probes: complete operations, one new reservation per sample --------------------------------------------------------------------------------------
async function timed(fn) { const t0 = performance.now(); const r = await fn(); return { ms: performance.now() - t0, r }; }
async function writeProbes() {
  if (!staff) return;
  const H = { ...staff.headers, "Content-Type": "application/json" };
  const json2 = async (method, path, body, extra = {}) => { const res = await fetch(`${API}/api/v1${path}`, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }); const text = await res.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* not json */ } return { status: res.status, body: j }; };
  const full = (await json2("GET", "/products?size=40")).body?.items ?? [];
  const product = full.find((p) => !(p.variants ?? []).length && (p.prices ?? []).some((x) => x.currency === "HTG" && (x.minOrderQuantity ?? 1) <= 1) && (p.availableQuantity ?? 0) > 0);
  if (!product) { console.log("SKIP write probes: no simple HTG product in the seeded catalog"); return; }
  // make sure the probes cannot be refused for stock: add stock through the real staff endpoint (test database only: the guard above has identified it)
  const inv = ((await json2("GET", `/admin/inventory?size=100&q=${encodeURIComponent(product.sku)}`)).body?.items ?? []).find((i) => i.productId === product.id || i.sku === product.sku);
  if (inv) await json2("POST", `/admin/inventory/${inv.id}/adjustments`, { type: "ADD", quantity: N * 4 + 20, reason: "CORRECTION", note: "latency probe stock" }, { "Idempotency-Key": crypto.randomUUID() });
  const series = { submit: [], lookup: [], accept: [], ready: [], pay: [], collect: [] };
  const bad = { submit: 0, lookup: 0, accept: 0, ready: 0, pay: 0, collect: 0 };
  for (let i = 0; i < N + 1; i++) {                                   // sample 0 is the warm-up
    const phone = `3${String(Math.floor(1e6 + Math.random() * 8.9e6))}`;
    const body = { lines: [{ productId: product.id, quantity: 1, currency: "HTG" }], contact: { firstName: "Latence", lastName: "Sonde", dialCode: "+509", phone }, locale: "fr", acknowledgedTerms: true };
    const sub = await timed(() => fetch(`${API}/api/v1/reservations`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) }));
    const created = await sub.r.json().catch(() => null);
    if (sub.r.status !== 201 || !created?.id) { bad.submit++; continue; }
    const lk = await timed(() => fetch(`${API}/api/v1/reservations/lookup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: created.reference, phone: `+509 ${phone}` }) }));
    const step = async (name, path, b, extra) => { const t = await timed(() => json2("POST", path, b, extra)); if (t.r.status >= 300) bad[name]++; return t; };
    const acc = await step("accept", `/admin/reservations/${created.id}/accept`, {});
    const rdy = await step("ready", `/admin/reservations/${created.id}/ready`, {});
    const due = created.totals?.find((t) => t.currency === "HTG")?.amount;
    const pay = await step("pay", `/admin/reservations/${created.id}/payments`, { amount: due, currency: "HTG" }, { "Idempotency-Key": crypto.randomUUID() });
    const col = await step("collect", `/admin/reservations/${created.id}/collect`, {});
    if (i === 0) continue;
    series.submit.push(sub.ms); if (lk.r.status !== 200) bad.lookup++; series.lookup.push(lk.ms);
    series.accept.push(acc.ms); series.ready.push(rdy.ms); series.pay.push(pay.ms); series.collect.push(col.ms);
  }
  const names = { submit: "POST /reservations (submit)", lookup: "POST /reservations/lookup (tracking)", accept: "admin POST accept", ready: "admin POST ready", pay: "admin POST record cash payment", collect: "admin POST collect" };
  for (const k of Object.keys(series)) { const s = series[k].sort((a, b) => a - b); if (s.length) rows.push({ label: `API  ${names[k]}`, p50: pct(s, 50), p95: pct(s, 95), max: s[s.length - 1], bad: bad[k] }); }
}
await writeProbes();

const f = (n) => n.toFixed(0).padStart(5);
console.log(`\n${N} samples per route, target p95 <= ${TARGET} ms\n${"route".padEnd(34)}  p50    p95    max  bad`);
let slow = 0;
for (const r of rows) {
  const flag = r.p95 > TARGET ? "  SLOW" : "";
  if (r.p95 > TARGET) slow++;
  console.log(`${r.label.padEnd(34)} ${f(r.p50)} ${f(r.p95)} ${f(r.max)} ${String(r.bad).padStart(4)}${flag}`);
}
console.log(`\n${rows.length} routes, ${slow} over target`);
process.exit(slow ? 1 : 0);
