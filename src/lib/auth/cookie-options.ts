/**
 * Options for the Supabase auth cookies, on top of `@supabase/ssr`'s defaults (`SameSite=Lax`, `Path=/`, 400 days, NOT HttpOnly).
 *
 * `HttpOnly` stays off on purpose: the browser client reads the session from the cookie (it is how the server, the proxy and the browser share ONE session without localStorage),
 * so the compensating controls are the CSP, React escaping and the absence of `dangerouslySetInnerHTML` for user text (docs/security.md).
 *
 * `Secure` is added whenever the site is served over HTTPS: in the browser from the page protocol, on the server from `SECURITY_HTTPS_ONLY=true` (the same switch that turns on HSTS).
 * Left off on plain-http local verification, where a Secure cookie would never be sent back.
 *
 * `SameSite=Lax` and `Path=/` are stated explicitly rather than inherited from the library's defaults, so an upgrade can never silently loosen them (Lax: the cookie is not sent on cross-site
 * sub-requests, which blocks cross-site request forgery against the API calls the browser makes with the session; a top-level link navigation still carries it). The cookie lifetime is NOT
 * shortened here: how long a person stays signed in is a product decision (and the Supabase project's own session settings), not a code default.
 */
export interface AuthCookieOptions { secure: boolean; sameSite: "lax"; path: "/" }

export function authCookieOptions(): AuthCookieOptions {
  if (typeof window !== "undefined") return { secure: window.location.protocol === "https:", sameSite: "lax", path: "/" };
  return { secure: /^(1|true|yes)$/i.test(process.env.SECURITY_HTTPS_ONLY?.trim() ?? ""), sameSite: "lax", path: "/" };
}
