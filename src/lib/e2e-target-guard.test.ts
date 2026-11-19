import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script shared by the seed and every browser suite
import { SEED_STORE_NAME, TargetRefused, assertDedicatedTestTarget, assertLocalUrls, assertLocalWeb, configProblems, pickupProblems } from "../../scripts/e2e-target-guard.mjs";

const good = { API_URL: "http://127.0.0.1:8086", E2E_TARGET_CONFIRM: "http://127.0.0.1:8086", SUPABASE_URL: "http://127.0.0.1:54321", WEB_URL: "http://127.0.0.1:3106" };
const answer = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("test-data target guard: refuses anything it cannot positively identify as a dedicated local test target", () => {
  it("accepts an explicit, confirmed, loopback target", () => {
    expect(configProblems(good)).toEqual([]);
  });

  it("refuses missing configuration: there is no default target", () => {
    expect(configProblems({}).join("|")).toMatch(/API_URL is not set/);
    expect(configProblems({}).join("|")).toMatch(/SUPABASE_URL is not set/);
    expect(configProblems({ ...good, API_URL: undefined, E2E_TARGET_CONFIRM: undefined })).not.toEqual([]);
    expect(configProblems({ ...good, WEB_URL: "" }).join("|")).toMatch(/WEB_URL is not set/);
  });

  it("refuses an inherited API_URL that the operator did not confirm, or confirmed as something else", () => {
    expect(configProblems({ ...good, E2E_TARGET_CONFIRM: undefined }).join("|")).toMatch(/E2E_TARGET_CONFIRM must equal API_URL/);
    expect(configProblems({ ...good, E2E_TARGET_CONFIRM: "http://127.0.0.1:8080" }).join("|")).toMatch(/E2E_TARGET_CONFIRM must equal API_URL/);
    expect(configProblems({ ...good, E2E_TARGET_CONFIRM: "http://127.0.0.1:8086/" })).toEqual([]);   // a trailing slash is the same service
  });

  it("refuses non-loopback and hosted-looking targets, credentials, and bad URLs", () => {
    expect(configProblems({ ...good, API_URL: "https://api.example.org", E2E_TARGET_CONFIRM: "https://api.example.org" }).join("|")).toMatch(/not a loopback/);
    expect(configProblems({ ...good, SUPABASE_URL: "https://abcd.supabase.co" }).join("|")).toMatch(/hosted service/);
    // the override allows a dedicated test machine, but never a hosted-looking name
    const remote = { ...good, API_URL: "http://10.0.0.5:8086", E2E_TARGET_CONFIRM: "http://10.0.0.5:8086", E2E_ALLOW_NON_LOOPBACK: "1" };
    expect(configProblems(remote)).toEqual([]);
    expect(configProblems({ ...remote, SUPABASE_URL: "https://abcd.supabase.co" }).join("|")).toMatch(/hosted service/);
    expect(configProblems({ ...good, API_URL: "http://user:pw@127.0.0.1:8086", E2E_TARGET_CONFIRM: "http://user:pw@127.0.0.1:8086" }).join("|")).toMatch(/credentials/);
    expect(configProblems({ ...good, WEB_URL: "not a url" }).join("|")).toMatch(/not a valid URL/);
    expect(configProblems({ ...good, WEB_URL: "ftp://127.0.0.1" }).join("|")).toMatch(/http\(s\)/);
  });

  it("identifies a dedicated test store: never configured, or the seed's own store name; anything else is refused", () => {
    expect(pickupProblems({ status: "not_configured" })).toEqual([]);
    expect(pickupProblems({ status: "available", location: { storeName: SEED_STORE_NAME } })).toEqual([]);
    expect(pickupProblems({ status: "available", location: { storeName: "Ana Dépôt" } }).join("|")).toMatch(/not a dedicated test store/);
    expect(pickupProblems({ status: "disabled" }).join("|")).toMatch(/not a dedicated test store/);
    expect(pickupProblems(null).join("|")).toMatch(/cannot identify the target/);
    expect(pickupProblems("nope").join("|")).toMatch(/cannot identify the target/);
  });

  it("the full check reads the service's PUBLIC pickup answer before anything is written, and refuses what it cannot identify", async () => {
    await expect(assertDedicatedTestTarget({ env: good, fetchImpl: answer({ status: "not_configured" }) })).resolves.toBe(true);
    await expect(assertDedicatedTestTarget({ env: good, fetchImpl: answer({ status: "available", location: { storeName: SEED_STORE_NAME } }) })).resolves.toBe(true);
    await expect(assertDedicatedTestTarget({ env: good, fetchImpl: answer({ status: "available", location: { storeName: "Boutique réelle" } }) })).rejects.toBeInstanceOf(TargetRefused);
    await expect(assertDedicatedTestTarget({ env: good, fetchImpl: answer({}, false) })).rejects.toBeInstanceOf(TargetRefused);                      // unreachable / error answer
    await expect(assertDedicatedTestTarget({ env: good, fetchImpl: (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch })).rejects.toBeInstanceOf(TargetRefused);
    await expect(assertDedicatedTestTarget({ env: {}, fetchImpl: answer({ status: "not_configured" }) })).rejects.toBeInstanceOf(TargetRefused);       // never even asks without configuration
  });

  it("does not contact the network when the configuration is already refused", async () => {
    let calls = 0;
    const spy = (async () => { calls++; return { ok: true, json: async () => ({ status: "not_configured" }) }; }) as unknown as typeof fetch;
    await expect(assertDedicatedTestTarget({ env: { ...good, E2E_TARGET_CONFIRM: undefined }, fetchImpl: spy })).rejects.toBeInstanceOf(TargetRefused);
    expect(calls).toBe(0);
  });

  it("web-only suites must name a local web URL explicitly", () => {
    expect(assertLocalWeb({ WEB_URL: "http://127.0.0.1:3106" })).toBe(true);
    expect(() => assertLocalWeb({})).toThrow(TargetRefused);
    expect(() => assertLocalWeb({ WEB_URL: "https://staging.anadepot.com" })).toThrow(TargetRefused);
  });

  it("other services a suite talks to (local Supabase, mail catcher) must be named and local too", () => {
    expect(assertLocalUrls({ SUPABASE_URL: "http://127.0.0.1:54321", MAIL_URL: "http://localhost:54324" }, ["SUPABASE_URL", "MAIL_URL"])).toBe(true);
    expect(() => assertLocalUrls({ SUPABASE_URL: "http://127.0.0.1:54321" }, ["SUPABASE_URL", "MAIL_URL"])).toThrow(/MAIL_URL is not set/);
    expect(() => assertLocalUrls({ SUPABASE_URL: "https://x.supabase.co" }, ["SUPABASE_URL"])).toThrow(/hosted/);
  });
});
