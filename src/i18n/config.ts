/** Supported UI languages. `fr` = Français, `ht` = Kreyòl ayisyen. English may be added later. */
export const locales = ["fr", "ht"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";
export const LOCALE_COOKIE = "ana_locale";

export const localeNames: Record<Locale, { native: string; short: string }> = {
  fr: { native: "Français", short: "FR" },
  ht: { native: "Kreyòl ayisyen", short: "KR" },
};

export const isLocale = (value: string | undefined | null): value is Locale =>
  !!value && (locales as readonly string[]).includes(value);

/** Pick a locale from an Accept-Language header; used only to *suggest* a first language. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (base === "ht") return "ht";
    if (base === "fr") return "fr";
  }
  return defaultLocale;
}
