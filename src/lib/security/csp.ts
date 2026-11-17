/**
 * Content-Security-Policy for the storefront + administration, built from deployment configuration (no hand-edited strings per environment).
 *
 * What is allowed, and why:
 *  - `connect-src`: the app itself, the configured Supabase project (Auth), the configured Spring Boot API and the asset origin(s) (the service worker fetches images). Nothing else can receive data from a script.
 *  - `img-src`: the app, `data:`/`blob:` (seller upload previews) and the configured asset origin(s) (`NEXT_PUBLIC_ASSET_ORIGINS`, the public R2/CDN domain the API serves
 *    product images from). If no asset origin is configured, production falls back to `https:` (images cannot run code) and the build prints a warning.
 *  - `script-src 'self' 'unsafe-inline'`: a deliberate, documented trade-off. A nonce would force every page to render dynamically and defeats Partial Prerendering /
 *    the static HTML shell that the SEO and performance requirements depend on (see docs/security.md). It is compensated by: no `dangerouslySetInnerHTML` anywhere,
 *    React escaping, no third-party scripts, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, a closed `connect-src` and `frame-ancestors 'none'`.
 *    `'unsafe-eval'` exists ONLY in development (React debugging); `ws:` only in development (HMR).
 *  - `worker-src 'self'` / `manifest-src 'self'`: the service worker and web manifest must be same-origin.
 */
export interface CspInput {
  /** `NEXT_PUBLIC_SUPABASE_URL` */
  supabaseUrl?: string;
  /** `NEXT_PUBLIC_API_BASE_URL` (the browser calls this) */
  apiBaseUrl?: string;
  /** `NEXT_PUBLIC_ASSET_ORIGINS`: comma-separated origins images are served from */
  assetOrigins?: string;
  development?: boolean;
  /** The site is served over HTTPS (adds `upgrade-insecure-requests`). Off for local http verification, where it would break calls to the local API. */
  httpsOnly?: boolean;
}

/** The origin (scheme://host[:port]) of a URL, or null for anything that is not an http(s) URL. A path, query or credentials never reach the policy. */
export function originOf(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

const uniq = (items: (string | null)[]): string[] => [...new Set(items.filter((x): x is string => !!x))];

export function assetOriginsOf(raw: string | undefined): string[] {
  return uniq((raw ?? "").split(",").map(originOf));
}

export function buildCsp(input: CspInput): string {
  const dev = !!input.development;
  const supabase = originOf(input.supabaseUrl);
  const api = originOf(input.apiBaseUrl);
  const assets = assetOriginsOf(input.assetOrigins);

  // The asset origins are also `connect-src`: the service worker (src/pwa/sw.js) fetches images with fetch(), which is governed by connect-src, not img-src
  // (without it every product image failed with ERR_FAILED once the worker was active). Read-only public origin(s) the deployment owns.
  const connect = ["'self'", ...uniq([supabase, api, ...assets]), ...(dev ? ["ws:", "wss:"] : [])];
  const img = ["'self'", "data:", "blob:", ...(assets.length ? assets : dev ? [] : ["https:"])];
  // In development the local object store / API are plain http on loopback: allow loopback images so product photos render.
  if (dev) img.push("http://127.0.0.1:*", "http://localhost:*");

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", img],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connect],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["frame-src", ["'none'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (input.httpsOnly) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
