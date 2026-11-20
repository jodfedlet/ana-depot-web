#!/usr/bin/env node
/**
 * CONCURRENCY measurement and invariant checks against the real API and the built web app (LOCAL, dedicated test target only: see scripts/e2e-target-guard.mjs; it CREATES and then
 * cancels reservations, records cash payments and collects, and restores the stock it used). It says nothing about a hosted deployment, TLS, a mobile network or a cold start.
 *
 *   WEB_URL=... API_URL=... E2E_TARGET_CONFIRM=<API_URL> SUPABASE_URL=... SUPABASE_PUBLIC_KEY=... STAFF_EMAIL=... STAFF_PASSWORD=... node scripts/measure-concurrency.mjs [seconds=10]
 *
 * A. READ LOAD: 10, 25 and 50 virtual users loop over catalog, search, product, categories, payment options, pickup and server-rendered pages for N seconds each: throughput, p50/p95/p99,
 *    errors. (The local stack runs with relaxed rate limits so that one machine can generate the load; production limits are per client address.)
 * B. CONTENTION, each an invariant, not a speed:
 *    1. no overselling: more simultaneous reservations than units -> exactly as many succeed as there were units, the rest are refused, reserved stock rises by exactly that;
 *    2. one Idempotency-Key submitted by many clients at once creates ONE reservation;
 *    3. many reservations moved through accept -> ready -> cash payment -> collect at once: every step succeeds, no server error, books reconcile;
 *    4. simultaneous cash payments against one balance never record more than is due (D3).
 * Exit 0 = every invariant holds, no 5xx anywhere and the read p95 at 25 users is at most TARGET_MS (default 1000).
 */
import crypto from "node:crypto";
import { TargetRefused, assertDedicatedTestTarget } from "./e2e-target-guard.mjs";

try { await assertDedicatedTestTarget({ needWeb: true }); } catch (e) { console.error(e instanceof TargetRefused ? e.message : String(e)); process.exit(2); }
const WEB = process.env.WEB_URL, API = process.env.API_URL, SB = process.env.SUPABASE_URL;
const SECONDS = Number(process.argv[2] ?? 10);
const TARGET = Number(process.env.TARGET_MS ?? 1000);
const uuid = () => crypto.randomUUID();
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0);
let serverErrors = 0;
const failures = [];
const fail = (m) => { failures.push(m); console.log(`FAIL  ${m}`); };
const ok = (m, d = "") => console.log(`PASS  ${m}${d ? `  [${d}]` : ""}`);

const token = (await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: process.env.SUPABASE_PUBLIC_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env.STAFF_EMAIL, password: process.env.STAFF_PASSWORD }) })).json()).access_token;
async function call(method, path, body, headers = {}, base = API) {
  const t0 = performance.now();
  const r = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Accept: "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const text = await r.text();
  if (r.status >= 500) serverErrors++;
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, body: json, ms: performance.now() - t0 };
}
const staff = (method, path, body, extra = {}) => call(method, `/api/v1${path}`, body, { Authorization: `Bearer ${token}`, ...extra });

// ---------------------------------------------------------------------------------------------- A. read load
const products = (await call("GET", "/api/v1/products?size=20")).body.items;
const slug = products[0].slug;
const mix = [
  ["API  /products?size=20", () => call("GET", "/api/v1/products?size=20")], ["API  /products/search", () => call("GET", "/api/v1/products/search?q=tube&size=20")], ["API  /products/{slug}", () => call("GET", `/api/v1/products/${slug}`)],
  ["API  /categories", () => call("GET", "/api/v1/categories")], ["API  /store/payment-options", () => call("GET", "/api/v1/store/payment-options")], ["API  /store/pickup", () => call("GET", "/api/v1/store/pickup")],
  ["WEB  /fr (home)", () => call("GET", "/fr", undefined, {}, WEB)], ["WEB  /fr/products/{slug}", () => call("GET", `/fr/products/${slug}`, undefined, {}, WEB)], ["WEB  /ht/products", () => call("GET", "/ht/products", undefined, {}, WEB)],
];
console.log(`\nA. READ LOAD (${SECONDS} s per level; mix of ${mix.length} routes: 6 API, 3 server-rendered pages)`);
console.log("users   req/s     p50     p95     p99     max   errors(non-2xx/3xx)  5xx");
const levels = {};
for (const users of [10, 25, 50]) {
  const lat = []; let bad = 0; const e5 = serverErrors; const stop = performance.now() + SECONDS * 1000; let n = 0; const by = new Map();
  await Promise.all(Array.from({ length: users }, async (_, u) => {
    for (let i = u; performance.now() < stop; i++) { const [label, f] = mix[i % mix.length]; const r = await f(); n++; lat.push(r.ms); if (r.status >= 400) bad++; if (!by.has(label)) by.set(label, []); by.get(label).push(r.ms); }
  }));
  lat.sort((a, b) => a - b);
  levels[users] = { p95: pct(lat, 95), by: new Map([...by].map(([k, v]) => [k, v.sort((a, b) => a - b)])) };
  console.log(`${String(users).padStart(5)} ${(n / SECONDS).toFixed(0).padStart(7)} ${pct(lat, 50).toFixed(0).padStart(7)} ${pct(lat, 95).toFixed(0).padStart(7)} ${pct(lat, 99).toFixed(0).padStart(7)} ${lat[lat.length - 1].toFixed(0).padStart(7)} ${String(bad).padStart(10)} ${String(serverErrors - e5).padStart(17)}`);
}
console.log("\nper route at 25 users (ms):          n     p50     p95     p99");
for (const [label, v] of levels[25].by) console.log(`  ${label.padEnd(30)} ${String(v.length).padStart(5)} ${pct(v, 50).toFixed(0).padStart(7)} ${pct(v, 95).toFixed(0).padStart(7)} ${pct(v, 99).toFixed(0).padStart(7)}`);
if (levels[25].p95 <= TARGET) ok(`read p95 at 25 concurrent users <= ${TARGET} ms`, `${levels[25].p95.toFixed(0)} ms`); else fail(`read p95 at 25 users ${levels[25].p95.toFixed(0)} ms > ${TARGET} ms`);

// ---------------------------------------------------------------------------------------------- B. contention
console.log("\nB. CONTENTION INVARIANTS");
const target = products.find((p) => !(p.variants ?? []).length && (p.prices ?? []).some((x) => x.currency === "HTG")) ?? products[0];
const positionOf = async (id) => (await staff("GET", `/admin/inventory?productId=${id}&size=50`)).body.items.find((i) => i.variantId == null);
const reserve = (qty, phone, key = uuid()) => call("POST", "/api/v1/reservations", { lines: [{ productId: target.id, quantity: qty, currency: "HTG" }], contact: { firstName: "Charge", lastName: "Test", dialCode: "+509", phone, email: `load-${uuid()}@example.test` }, locale: "fr", acknowledgedTerms: true }, { "Idempotency-Key": key });
const phone = () => `39${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const created = [];

{ // B1 no overselling
  const before = await positionOf(target.id);
  const available = before.onHand - before.reserved;
  const attempts = available + 25;
  const rs = await Promise.all(Array.from({ length: attempts }, () => reserve(1, phone())));
  const won = rs.filter((r) => r.status === 201), refused = rs.filter((r) => r.status === 409 || r.status === 422);
  won.forEach((r) => created.push(r.body.id));
  const after = await positionOf(target.id);
  if (won.length === available && won.length + refused.length === attempts && after.reserved - before.reserved === won.length && after.onHand === before.onHand) ok("no overselling", `${attempts} simultaneous requests for ${available} units: ${won.length} reserved, ${refused.length} refused, reserved +${after.reserved - before.reserved}`);
  else fail(`overselling check: available ${available}, won ${won.length}, refused ${refused.length}, other ${attempts - won.length - refused.length}, reserved ${before.reserved} -> ${after.reserved}`);
}
{ // B2 one idempotency key, many clients
  await Promise.all(created.splice(0).map((id) => staff("POST", `/admin/reservations/${id}/cancel`, { reason: "load test cleanup" }, { "Idempotency-Key": uuid() })));   // free the stock first
  const key = uuid(), p = phone();
  const rs = await Promise.all(Array.from({ length: 12 }, () => reserve(1, p, key)));
  const ids = new Set(rs.filter((r) => r.status === 201 || r.status === 200).map((r) => r.body?.id));
  if (ids.size === 1 && rs.every((r) => r.status < 500)) ok("one Idempotency-Key from 12 simultaneous clients created exactly one reservation", `${rs.map((r) => r.status).join(",")}`);
  else fail(`idempotency: ${ids.size} reservations from one key, statuses ${rs.map((r) => r.status).join(",")}`);
  ids.forEach((id) => created.push(id));
}
{ // B3 many reservations through the whole lifecycle at once
  const K = 20;
  const rs = await Promise.all(Array.from({ length: K }, () => reserve(1, phone())));
  const ids = rs.filter((r) => r.status === 201).map((r) => r.body.id);
  if (ids.length !== K) fail(`lifecycle: only ${ids.length}/${K} reservations were created`);
  const step = async (name, f) => { const out = await Promise.all(ids.map(f)); const bad = out.filter((r) => r.status >= 300); const lat = out.map((r) => r.ms).sort((a, b) => a - b); if (bad.length) fail(`${name}: ${bad.length}/${ids.length} failed (${[...new Set(bad.map((b) => b.status))].join(",")})`); else ok(`${name}: ${ids.length} simultaneous, all succeeded`, `p95 ${pct(lat, 95).toFixed(0)} ms, max ${lat[lat.length - 1].toFixed(0)} ms`); return out; };
  await step("accept", (id) => staff("POST", `/admin/reservations/${id}/accept`, undefined, { "Idempotency-Key": uuid() }));
  await step("ready", (id) => staff("POST", `/admin/reservations/${id}/ready`, {}, { "Idempotency-Key": uuid() }));
  const dues = await Promise.all(ids.map(async (id) => ({ id, total: (await staff("GET", `/admin/reservations/${id}`)).body.balances[0].total })));
  await step("record cash payment (full balance)", async (id) => staff("POST", `/admin/reservations/${id}/payments`, { amount: dues.find((d) => d.id === id).total, currency: "HTG", method: "CASH_AT_PICKUP" }, { "Idempotency-Key": uuid() }));
  await step("collect", (id) => staff("POST", `/admin/reservations/${id}/collect`, undefined, { "Idempotency-Key": uuid() }));
  const recon = await Promise.all(ids.map((id) => staff("GET", `/admin/reservations/${id}/reconciliation`)));
  if (recon.every((r) => r.body?.consistent === true)) ok("the ledger reconciles for every one of them"); else fail("reconciliation inconsistent after the simultaneous lifecycle");
  const states = await Promise.all(ids.map(async (id) => (await staff("GET", `/admin/reservations/${id}`)).body.status));
  if (states.every((s) => s === "COLLECTED")) ok("every reservation ended COLLECTED"); else fail(`final states: ${[...new Set(states)].join(",")}`);
}
{ // B4 simultaneous payments against one balance (D3: never more than is due)
  const r = await reserve(1, phone()); const id = r.body.id;
  await staff("POST", `/admin/reservations/${id}/accept`, undefined, { "Idempotency-Key": uuid() });
  await staff("POST", `/admin/reservations/${id}/ready`, {}, { "Idempotency-Key": uuid() });
  const total = Number((await staff("GET", `/admin/reservations/${id}`)).body.balances[0].total);
  const part = (total / 4).toFixed(2);   // four equal parts settle it exactly; eight tries race for them
  const rs = await Promise.all(Array.from({ length: 8 }, () => staff("POST", `/admin/reservations/${id}/payments`, { amount: part, currency: "HTG", method: "CASH_AT_PICKUP" }, { "Idempotency-Key": uuid() })));
  const d = (await staff("GET", `/admin/reservations/${id}`)).body.balances[0];
  const accepted = rs.filter((x) => x.status === 201).length;
  if (accepted === 4 && Number(d.paid) === total && Number(d.due) === 0 && rs.every((x) => x.status === 201 || x.status === 409 || x.status === 422)) ok("simultaneous payments never record more than is due", `${accepted} of 8 recorded, paid ${d.paid} of ${d.total}`);
  else fail(`payments race: ${accepted} accepted, paid ${d.paid}, total ${d.total}, statuses ${rs.map((x) => x.status).join(",")}`);
  created.push(id);
}

// cleanup: the stock this tool used is given back (cancel what is still open; add back what collection deducted)
const pos = await positionOf(target.id);
await Promise.all(created.map((id) => staff("POST", `/admin/reservations/${id}/cancel`, { reason: "load test cleanup" }, { "Idempotency-Key": uuid() })));
const finalPos = await positionOf(target.id);
console.log(`\ncleanup: ${target.slug} reserved ${pos.reserved} -> ${finalPos.reserved} (the collected test reservations consumed stock; adjust with the inventory screen if you need the baseline back)`);

if (serverErrors > 0) fail(`${serverErrors} server error(s) (5xx) during the run`); else ok("no server error (5xx) anywhere in the run");
console.log(`\n${failures.length ? `${failures.length} FAILED` : "all invariants hold"}`);
process.exit(failures.length ? 1 : 0);
