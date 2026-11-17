import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { type Locale, locales } from "@/i18n/config";
import { absoluteUrl, languageAlternates, siteOrigin } from "./site";

export interface PageSeo {
  locale: Locale;
  /** Locale-less path of the CANONICAL version of this page (`/products`, `/products/some-slug`). */
  path: string;
  title: string;
  description?: string;
  /** Absolute https image URL of the page (a real product/category photo); never the placeholder. */
  image?: string;
  /** `product` for product pages (Open Graph type). */
  ogType?: "website" | "article";
  /** Keep the page out of search results (it may still be crawled for links). */
  noindex?: boolean;
}

const OG_LOCALE: Record<Locale, string> = { fr: "fr_HT", ht: "ht_HT" };

/**
 * The metadata every public page shares: unique title and description, ONE canonical URL (query variants never are), hreflang for both languages, Open Graph and Twitter
 * cards. Without a site origin (see `siteOrigin`) the absolute-URL parts are left out rather than guessed.
 */
export function pageMetadata(seo: PageSeo, origin: string | null = siteOrigin()): Metadata {
  const url = absoluteUrl(seo.locale, seo.path, origin);
  const languages = languageAlternates(seo.path, origin);
  const images = seo.image ? [{ url: seo.image }] : undefined;
  return {
    title: seo.title,
    description: seo.description,
    ...(url ? { alternates: { canonical: url, ...(languages ? { languages } : {}) } } : {}),
    ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: seo.ogType ?? "website",
      siteName: siteConfig.name,
      title: seo.title,
      description: seo.description,
      locale: OG_LOCALE[seo.locale],
      alternateLocale: locales.filter((l) => l !== seo.locale).map((l) => OG_LOCALE[l]),
      ...(url ? { url } : {}),
      ...(images ? { images } : {}),
    },
    twitter: { card: images ? "summary_large_image" : "summary", title: seo.title, description: seo.description, ...(images ? { images: images.map((i) => i.url) } : {}) },
  };
}

/** Pages that belong to one person or one session: crawlable links are fine, indexing is not. */
export const noindexMetadata = (title: string): Metadata => ({ title, robots: { index: false, follow: false } });

/** The path prefixes (locale-less) that robots.txt keeps crawlers out of. These pages also carry `noindex`. */
export const PRIVATE_PATHS = ["/admin", "/account", "/auth", "/reserve", "/reservations", "/cart", "/search", "/payment"] as const;
