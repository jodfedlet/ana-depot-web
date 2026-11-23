import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression test for the Cloudflare Workers hang (docs/cloudflare-deployment.md, section 6): the build guard must refuse a build made with Cache Components and
 * accept the classic one. It runs the real script against fixture `required-server-files.json` documents.
 */
const script = path.resolve(import.meta.dirname, "../../scripts/check-no-cache-components.mjs");
const run = (config: object) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "guard-")), "required-server-files.json");
  writeFileSync(file, JSON.stringify({ config }));
  return spawnSync("node", [script, file], { encoding: "utf8" });
};

describe("check-no-cache-components build guard", () => {
  it("accepts the classic build (cacheComponents off)", () => {
    const r = run({ cacheComponents: false, experimental: {} });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("OK");
  });
  it("refuses cacheComponents (top-level or experimental) and partialPrefetching", () => {
    for (const config of [{ cacheComponents: true }, { experimental: { cacheComponents: true } }, { partialPrefetching: true }, { experimental: { partialPrefetching: true } }]) {
      const r = run(config);
      expect(r.status, JSON.stringify(config)).toBe(1);
      expect(r.stderr).toContain("Cloudflare");
    }
  });
  it("fails when there is no build output to check", () => {
    expect(spawnSync("node", [script, "/nonexistent/required-server-files.json"], { encoding: "utf8" }).status).toBe(2);
  });
  it("the next.config.ts of this repository keeps Cache Components off", () => {
    const out = execFileSync("node", ["-e", "import('node:fs').then(({readFileSync})=>{const s=readFileSync('next.config.ts','utf8').split('\\n').filter(l=>!l.trim().startsWith('//')).join('\\n');process.stdout.write(/cacheComponents\\s*:\\s*true|partialPrefetching\\s*:\\s*true/.test(s)?'ON':'OFF')})"], { cwd: path.resolve(import.meta.dirname, "../..") }).toString();
    expect(out).toBe("OFF");
  });
  it("the service-worker route stays prerendered: a Worker has no src/ directory, so reading src/pwa at request time answers 500", () => {
    const route = readFileSync(path.resolve(import.meta.dirname, "../app/sw.js/route.ts"), "utf8");
    expect(route).toContain('export const dynamic = "force-static"');
  });
});
