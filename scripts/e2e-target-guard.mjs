#!/usr/bin/env node
/**
 * Safety guard for everything that WRITES test data through a running service (seed script, browser suites, latency measurement).
 * It never lets such a script run against a service it cannot positively identify as a dedicated, local test target.
 *
 * A target is accepted only when ALL of these hold:
 *   1. API_URL, WEB_URL (when a web app is used) and SUPABASE_URL are set explicitly. There are no defaults: an unset variable is a refusal, never "the usual port".
 *   2. E2E_TARGET_CONFIRM equals API_URL exactly: the operator has named the target they mean (a pasted or inherited API_URL alone is not enough).
 *   3. Every host is loopback (127.0.0.1, localhost, ::1), unless E2E_ALLOW_NON_LOOPBACK=1 is also set (a dedicated remote test box); a URL with credentials is always refused;
 *      a hosted-looking name (*.supabase.co, anadepot.*) is refused even with the override.
 *   4. The API identifies itself as a test store through its PUBLIC pickup answer: either a store that was never configured (a fresh dedicated database) or the seed's own marker
 *      store name. A running service whose store has any other name (a developer's database, a real shop) is refused, because it is not a dedicated test database.
 *
 * CLI: `node scripts/e2e-target-guard.mjs` (exit 0 = accepted, 1 = refused with the reasons, 2 = misuse). Library: `assertDedicatedTestTarget`.
 */
export const SEED_STORE_NAME = "Magasin de vérification (données de test)";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const HOSTED = /(^|\.)supabase\.co$|(^|\.)supabase\.in$|(^|\.)anadepot\.|(^|\.)workers\.dev$|(^|\.)pages\.dev$/i;

const clean = (v) => (v ?? "").trim().replace(/\/+$/, "");

/**
 * Pure: the configuration problems, or an empty list.
 * @param {Record<string, string | undefined>} env
 * @param {{ needWeb?: boolean, needApi?: boolean }} [opts]
 * @returns {string[]}
 */
export function configProblems(env, { needWeb = true, needApi = true } = {}) {
  const problems = [];
  const urls = {};
  const need = (name, required) => {
    const raw = clean(env[name]);
    if (!raw) { if (required) problems.push(`${name} is not set (there is no default target: name the service explicitly)`); return; }
    let u;
    try { u = new URL(raw); } catch { problems.push(`${name} is not a valid URL`); return; }
    if (u.username || u.password) problems.push(`${name} must not contain credentials`);
    if (!/^https?:$/.test(u.protocol)) problems.push(`${name} must be http(s)`);
    urls[name] = u;
    if (HOSTED.test(u.hostname)) problems.push(`${name} (${u.hostname}) looks like a hosted service: test data is never written there`);
    else if (!LOOPBACK.has(u.hostname) && env.E2E_ALLOW_NON_LOOPBACK !== "1") problems.push(`${name} (${u.hostname}) is not a loopback address (set E2E_ALLOW_NON_LOOPBACK=1 only for a dedicated test machine)`);
  };
  need("API_URL", needApi);
  need("SUPABASE_URL", needApi);
  need("WEB_URL", needWeb);
  if (needApi && clean(env.API_URL) && clean(env.E2E_TARGET_CONFIRM) !== clean(env.API_URL)) {
    problems.push("E2E_TARGET_CONFIRM must equal API_URL (confirm the exact service you mean to write test data to)");
  }
  return problems;
}

/**
 * Pure: is this PUBLIC pickup answer from a dedicated test store?
 * @param {any} body
 * @returns {string[]}
 */
export function pickupProblems(body) {
  if (!body || typeof body !== "object") return ["the API's pickup answer is not readable: cannot identify the target"];
  if (body.status === "not_configured") return [];                                  // a fresh, never-configured database
  const name = body.location?.storeName;
  if (body.status === "available" && name === SEED_STORE_NAME) return [];          // already seeded by the test seed
  return [`the target API is not a dedicated test store (pickup status "${body.status ?? "?"}"${name ? `, store "${name}"` : ""}): it may be a developer or real database`];
}

export class TargetRefused extends Error {
  constructor(problems) { super(`Refusing to write test data:\n - ${problems.join("\n - ")}`); this.problems = problems; }
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch, needWeb?: boolean, timeoutMs?: number }} [options]
 * @returns {Promise<true>}
 */
export async function assertDedicatedTestTarget({ env = process.env, fetchImpl = fetch, needWeb = false, timeoutMs = 5000 } = {}) {
  const config = configProblems(env, { needWeb });
  if (config.length) throw new TargetRefused(config);
  let body = null;
  try {
    const res = await fetchImpl(`${clean(env.API_URL)}/api/v1/store/pickup`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    body = res.ok ? await res.json() : null;
  } catch { body = null; }
  const identity = pickupProblems(body);
  if (identity.length) throw new TargetRefused(identity);
  return true;
}

/** Suites that only drive a web build (no API writes): the web URL must still be named explicitly and be local. */
/** @param {Record<string, string | undefined>} [env] */
export function assertLocalWeb(env = process.env) {
  const problems = configProblems(env, { needWeb: true, needApi: false });
  if (problems.length) throw new TargetRefused(problems);
  return true;
}

/** Any other service a suite talks to (local Supabase, mail catcher...): explicit, local, never hosted. */
/** @param {Record<string, string | undefined>} env @param {string[]} names */
export function assertLocalUrls(env, names) {
  const problems = [];
  for (const name of names) {
    const raw = clean(env[name]);
    if (!raw) { problems.push(`${name} is not set (there is no default target: name the service explicitly)`); continue; }
    try {
      const u = new URL(raw);
      if (HOSTED.test(u.hostname)) problems.push(`${name} (${u.hostname}) looks like a hosted service`);
      else if (!LOOPBACK.has(u.hostname) && env.E2E_ALLOW_NON_LOOPBACK !== "1") problems.push(`${name} (${u.hostname}) is not a loopback address`);
    } catch { problems.push(`${name} is not a valid URL`); }
  }
  if (problems.length) throw new TargetRefused(problems);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const web = process.argv.includes("--web-only");
  try {
    if (web) assertLocalWeb(); else await assertDedicatedTestTarget();
    console.log(`target accepted: ${clean(process.env.API_URL || process.env.WEB_URL)}`);
  } catch (e) {
    if (e instanceof TargetRefused) { console.error(e.message); process.exit(1); }
    console.error(String(e)); process.exit(2);
  }
}
