import { siteConfig } from "@/config/site";
import { type Locale } from "@/i18n/config";
import type { Product } from "@/lib/catalog-types";
import { PLACEHOLDER_IMAGE } from "@/lib/api/map-catalog";
import { currencyDigits } from "@/lib/money";
import { plainSnippet } from "./text";
import { absoluteUrl } from "./site";

/**
 * Structured data (schema.org JSON-LD). EVERYTHING here is backed by data the API returned or by the site configuration: no rating, review, shipping, return policy,
 * address, phone or opening hours is ever invented, and HTG and USD are never combined (one offer per currency, each in its own `priceCurrency`).
 */
type Json = Record<string, unknown>;

/** Serializes for a `<script type="application/ld+json">`: `<`, `>`, `&` and the JS line separators are escaped so stored text can never close the tag. */
export function jsonLdString(data: Json | Json[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** `1500` minor units of HTG -> "1500.00": a decimal string, as schema.org expects, from the integer minor amount (no float drift). */
export function decimalPrice(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  const negative = minor < 0;
  const abs = String(Math.abs(Math.trunc(minor))).padStart(digits + 1, "0");
  const whole = abs.slice(0, abs.length - digits);
  const frac = abs.slice(abs.length - digits);
  return `${negative ? "-" : ""}${whole}${digits > 0 ? `.${frac}` : ""}`;
}

export function organizationJsonLd(origin: string | null): Json {
  return { "@context": "https://schema.org", "@type": "Organization", name: siteConfig.name, ...(origin ? { url: origin } : {}) };
}

export function websiteJsonLd(locale: Locale, origin: string | null): Json {
  const home = absoluteUrl(locale, "/", origin);
  const search = absoluteUrl(locale, "/search?q={search_term_string}", origin);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    inLanguage: locale,
    ...(home ? { url: home } : {}),
    ...(search ? { potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: search }, "query-input": "required name=search_term_string" } } : {}),
  };
}

export interface Crumb { name: string; path?: string }

/** `path` is locale-less; the last crumb (the page itself) may omit it. Without a site origin the items keep their names and positions but no URL. */
export function breadcrumbJsonLd(locale: Locale, crumbs: Crumb[], origin: string | null): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => {
      const url = c.path !== undefined ? absoluteUrl(locale, c.path, origin) : null;
      return { "@type": "ListItem", position: i + 1, name: c.name, ...(url ? { item: url } : {}) };
    }),
  };
}

const AVAILABILITY: Record<Product["availability"], string> = {
  in_stock: "https://schema.org/InStock",
  low_stock: "https://schema.org/LimitedAvailability",
  out_of_stock: "https://schema.org/OutOfStock",
  preorder: "https://schema.org/PreOrder",
};

/**
 * The offers of one product: ONE per currency it is sold in, with the price a customer pays for a single unit (the sale price when there is a promotion).
 * When variants carry their own price in that currency the offer becomes an `AggregateOffer` (lowest to highest) instead of pretending one price. Wholesale tiers are not
 * part of schema.org offers and are not exported. Availability is the API's, never inferred.
 */
export function productOffers(product: Product, url: string | null): Json[] {
  const availability = AVAILABILITY[product.availability] ?? AVAILABILITY.out_of_stock;
  return product.offers.map((offer) => {
    const base: number[] = [offer.price.amount];
    const own = Object.values(offer.variantPrices).map((m) => m.amount);
    const currency = offer.currency;
    const common = { priceCurrency: currency, availability, ...(url ? { url } : {}) };
    if (own.length === 0) return { "@type": "Offer", price: decimalPrice(offer.price.amount, currency), ...common };
    // variants without an own price keep the product's price (only when some variant lacks one)
    const all = product.variants.length > own.length ? [...own, ...base] : own;
    return { "@type": "AggregateOffer", lowPrice: decimalPrice(Math.min(...all), currency), highPrice: decimalPrice(Math.max(...all), currency), offerCount: all.length, ...common };
  });
}

export function productJsonLd(product: Product, locale: Locale, origin: string | null): Json {
  const url = absoluteUrl(locale, `/products/${product.slug}`, origin);
  const images = product.images.map((i) => i.src).filter((src) => src !== PLACEHOLDER_IMAGE);
  const description = plainSnippet(product.description.join(" "), 500);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(description ? { description } : {}),
    ...(images.length ? { image: images } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(url ? { url } : {}),
    ...(product.categoryName ? { category: product.categoryName } : {}),
    offers: productOffers(product, url),
  };
}
