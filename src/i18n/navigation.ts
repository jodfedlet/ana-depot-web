"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { type Locale, locales } from "./config";
import { useLocale } from "./provider";

/** "/fr/products?x=1" -> "/products?x=1" */
export function stripLocale(pathname: string): string {
  for (const l of locales) {
    if (pathname === `/${l}`) return "/";
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
}

/** Prefix an internal href with the locale. External links, hashes and mailto/tel are untouched. */
export function localizeHref(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}

/** Router whose push/replace/prefetch accept locale-less paths. */
export function useLocaleRouter() {
  const router = useRouter();
  const locale = useLocale();
  return useMemo(
    () => ({
      push: (href: string) => router.push(localizeHref(href, locale)),
      replace: (href: string, options?: { scroll?: boolean }) => router.replace(localizeHref(href, locale), options),
      back: () => router.back(),
      /** Re-render server components (e.g. after the Supabase session cookie changed). */
      refresh: () => router.refresh(),
    }),
    [router, locale],
  );
}

/** Current path without the locale prefix. */
export function useLocalePathname(): string {
  return stripLocale(usePathname());
}
