import { type Locale, defaultLocale, locales } from "../../i18n/config";

/**
 * The public origin of the storefront (`NEXT_PUBLIC_SITE_URL`, e.g. https://www.example.com): canonical URLs, hreflang alternates, Open Graph URLs, the sitemap and
 * robots.txt are all built from it. It is a DEPLOYMENT value (the business owner's domain): nothing here guesses a domain. Without it, development falls back to
 * http://localhost:3000; production emits no absolute URLs at all (relative canonicals would be wrong) and the build prints a warning.
 */
export function siteOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* fall through */
    }
    return null;
  }
  return env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

/** `/products` for `fr` -> `/fr/products`; the home path is `/` -> `/fr`. */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path === "/" || path === "" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

/** An absolute URL on the site, or null when the site origin is not configured. */
export function absoluteUrl(locale: Locale, path: string, origin: string | null = siteOrigin()): string | null {
  return origin ? `${origin}${localizedPath(locale, path)}` : null;
}

/** hreflang alternates for one page: every language plus `x-default` (the default language, where the language selector decides). `null` without a site origin. */
export function languageAlternates(path: string, origin: string | null = siteOrigin()): Record<string, string> | null {
  if (!origin) return null;
  return {
    ...Object.fromEntries(locales.map((l) => [l, `${origin}${localizedPath(l, path)}`])),
    "x-default": `${origin}${localizedPath(defaultLocale, path)}`,
  };
}

/** Build-time hints printed once by next.config. */
export function seoWarnings(env: Record<string, string | undefined> = process.env): string[] {
  return siteOrigin(env) === null && env.NODE_ENV === "production"
    ? ["NEXT_PUBLIC_SITE_URL is not set (or invalid): canonical URLs, hreflang, Open Graph URLs and the sitemap are omitted. Set it to the public https origin."]
    : [];
}
