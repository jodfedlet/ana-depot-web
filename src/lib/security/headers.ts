import { buildCsp, assetOriginsOf } from "./csp";

export interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/** `true`/`1` (case-insensitive). */
const flag = (v: string | undefined) => /^(1|true|yes)$/i.test(v?.trim() ?? "");

const STRIPPED_LOCALE = "/:locale(fr|ht)";

/**
 * Pages whose HTML is for ONE person (administration, account, sign-in/recovery flows, reservation tracking): never stored by a shared cache or the service worker.
 * The static shells carry no personal data (it is fetched client-side with the session token), but a CDN or proxy must not keep them either.
 */
export const PRIVATE_PAGE_SOURCES = [`${STRIPPED_LOCALE}/admin/:path*`, `${STRIPPED_LOCALE}/account/:path*`, `${STRIPPED_LOCALE}/auth/:path*`, `${STRIPPED_LOCALE}/reservations/:path*`];

/**
 * Security headers for every response, built from the environment at BUILD time (next.config `headers()` is evaluated at build).
 *  - `SECURITY_HTTPS_ONLY=true`: the deployment is HTTPS-only -> HSTS and `upgrade-insecure-requests`. HSTS is meaningless (and ignored) over plain http, and
 *    `upgrade-insecure-requests` would break the local http verification stack, so both are opt-in.
 *  - `SECURITY_CSP_REPORT_ONLY=true`: send the policy as Report-Only (observe violations in the browser console without blocking). Enforced by default.
 */
export function securityHeaders(env: Record<string, string | undefined> = process.env, development = env.NODE_ENV === "development"): HeaderRule[] {
  const httpsOnly = flag(env.SECURITY_HTTPS_ONLY);
  const csp = buildCsp({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    apiBaseUrl: env.NEXT_PUBLIC_API_BASE_URL,
    assetOrigins: env.NEXT_PUBLIC_ASSET_ORIGINS,
    development,
    httpsOnly,
  });
  const headers = [
    { key: flag(env.SECURITY_CSP_REPORT_ONLY) ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Nothing in the app needs these browser capabilities.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()" },
    { key: "X-Frame-Options", value: "DENY" }, // older browsers; the CSP frame-ancestors is the modern equivalent
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    ...(httpsOnly ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  ];
  return [
    { source: "/:path*", headers },
    ...PRIVATE_PAGE_SOURCES.map((source) => ({ source, headers: [{ key: "Cache-Control", value: "private, no-store" }] })),
  ];
}

/** Build-time hint (printed once): without asset origins the production image policy is the broader `https:` fallback. */
export function securityWarnings(env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = [];
  if (assetOriginsOf(env.NEXT_PUBLIC_ASSET_ORIGINS).length === 0 && env.NODE_ENV === "production") out.push("NEXT_PUBLIC_ASSET_ORIGINS is not set: img-src falls back to https:. Set it to the public image domain (R2/CDN).");
  return out;
}
