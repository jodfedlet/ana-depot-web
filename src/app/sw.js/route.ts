import fs from "node:fs";
import path from "node:path";

/**
 * `/sw.js`: the service worker, assembled at BUILD time from `src/pwa/policy.js` (pure cache rules) + `src/pwa/sw.js` (the worker) with a small
 * configuration header. `PWA_VERSION` (set in next.config.ts, new for every build unless pinned) names the caches, so a new build = new caches and the
 * old ones are deleted when the new worker activates.
 *
 * The file is not cached by the browser (`no-cache`), so updates are always noticed; its scope is the whole origin.
 */
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), "src/pwa", file), "utf8");

const originOf = (value: string | undefined): string | null => {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
};

export function GET() {
  const config = {
    version: process.env.PWA_VERSION ?? "dev",
    apiOrigin: originOf(process.env.NEXT_PUBLIC_API_BASE_URL),
    // Optional allow-list of image hosts (comma separated origins). Empty = any host may serve images (they are only ever images).
    assetOrigins: (process.env.NEXT_PUBLIC_ASSET_ORIGINS ?? "").split(",").map((o) => originOf(o.trim())).filter((o): o is string => !!o),
  };
  const body = `/* Ana Dépôt service worker — generated; edit src/pwa/*.js */\nconst ANA_SW = ${JSON.stringify(config)};\n${read("policy.js")}\n${read("sw.js")}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
