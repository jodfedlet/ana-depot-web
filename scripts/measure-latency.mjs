#!/usr/bin/env node
/**
 * Measures response time of the real API and the built web app against the 1-second target (p95 per route). LOCAL measurement on whatever stack the URLs point at:
 * it says nothing about a hosted deployment, a mobile network or a cold start. Sequential requests, warm-up discarded, no secrets printed.
 *
 *   WEB_URL=http://127.0.0.1:3106 API_URL=http://127.0.0.1:8086 SUPABASE_URL=... SUPABASE_PUBLIC_KEY=... STAFF_EMAIL=... STAFF_PASSWORD=... node scripts/measure-latency.mjs [samples=30]
 *
 * Exit 0 = every route's p95 is at most TARGET_MS (default 1000); 1 = at least one is slower.
 */
const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3106";
const API = process.env.API_URL ?? "http://127.0.0.1:8086";
const SB = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
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
const catSlug = ((await json(`${API}/api/v1/categories`)).items ?? [])[0]?.slug;
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
