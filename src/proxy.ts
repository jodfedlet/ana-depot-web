import { type NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, isLocale, locales, negotiateLocale } from "./i18n/config";
import { serverApiBaseUrl } from "./lib/api/base-url";
import { refreshAuthSession } from "./lib/auth/proxy-session";
import { catalogPathTarget, entryState } from "./lib/seo/catalog-exists";

/**
 * Jobs (none of them authorization):
 * 1. Locale routing. Every page lives under /fr or /ht. A request without a locale prefix is redirected using, in
 *    order: the saved language cookie, the browser's Accept-Language (as a suggestion), then the default language.
 * 2. Real 404s: an unknown/draft/inactive product or category answers 404 here, before the page streams (see lib/seo/catalog-exists.ts).
 * 3. Session freshness. For visitors who have a Supabase auth cookie, verify/refresh the session so Server Components
 *    and the browser see a valid token. Access to /admin and /account is decided by those pages on the server, and
 *    the backend authorizes every API call.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (hasLocale) {
    const target = catalogPathTarget(pathname);
    if (target && (await entryState(target.kind, target.slug, { apiBaseUrl: serverApiBaseUrl() })) === "missing") {
      return NextResponse.rewrite(new URL(`/${target.locale}/missing`, request.url), { status: 404 });
    }
    return refreshAuthSession(request);
  }

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : negotiateLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, API routes and any file with an extension (images, fonts, favicon…)
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
