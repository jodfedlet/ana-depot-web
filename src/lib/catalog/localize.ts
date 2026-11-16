import type { Locale } from "@/i18n/config";
import type { Category, Product, ProductOffer, ProductVariant } from "../catalog-types";
import { pick } from "../localized";
import { type CurrencyCode, money } from "../money";
import type { Reservation } from "../reservations/types";
import { market } from "@/config/market";
import { type CategoryRecord, type Pricing, type ProductRecord, hasVariantsRecord } from "./model";
import { availabilityOf, stockOf } from "./stock";

const sampleAlt = (locale: Locale, name: string) => (locale === "fr" ? `Illustration d'exemple : ${name}` : `Ilistrasyon egzanp: ${name}`);
export const PLACEHOLDER_IMAGE = "/sample/placeholder.svg";

export function toCategory(c: CategoryRecord, locale: Locale): Category {
  const name = pick(c.name, locale);
  return { slug: c.slug, name, description: pick(c.description, locale), image: { src: c.image ?? PLACEHOLDER_IMAGE, alt: c.image?.startsWith("/sample/") ? sampleAlt(locale, name) : name } };
}

/** Turns a stored record into the localized shape customers see, applying live stock. */
export function toProduct(rec: ProductRecord, category: CategoryRecord | undefined, locale: Locale, reservations: Reservation[]): Product {
  const name = pick(rec.name, locale);
  const hasV = hasVariantsRecord(rec);
  const total = stockOf(rec, reservations);
  const activeVariants = hasV ? rec.variants.filter((v) => v.active) : [];
  const offers: ProductOffer[] = rec.prices.map((pr) => {
    const sale = pr.sale !== undefined && pr.sale < pr.retail ? pr.sale : undefined;
    return {
      currency: pr.currency,
      price: money(sale ?? pr.retail, pr.currency),
      compareAtPrice: sale !== undefined ? money(pr.retail, pr.currency) : undefined,
      pricing: pr,
      minOrderQty: Math.max(1, pr.minOrderQty ?? 1),
      hasWholesale: pr.wholesale.enabled && pr.wholesale.tiers.length > 0,
      variantPrices: Object.fromEntries(activeVariants.filter((v) => v.prices?.[pr.currency] !== undefined).map((v) => [v.id, money(v.prices![pr.currency]!, pr.currency)])),
    };
  });
  // The first configured currency is the "primary" one (what cards show first). An unfinished draft may have none.
  const primary: Pricing | undefined = rec.prices[0];
  const primaryOffer = offers[0];
  const availability = hasV && total.tracked && !rec.variants.some((v) => v.active && stockOf(rec, reservations, v.id).available > 0) ? "out_of_stock" : availabilityOf(rec, total);

  const options = rec.options.map((o) => ({ name: pick(o.label, locale), values: o.values.map((v) => ({ value: pick(v.label, locale), swatch: v.swatch })) }));
  const variants: ProductVariant[] = hasV
    ? rec.variants.filter((v) => v.active).map((v) => {
        const info = stockOf(rec, reservations, v.id);
        return {
          id: v.id, sku: v.sku, price: primary && v.prices?.[primary.currency] !== undefined ? money(v.prices[primary.currency]!, primary.currency) : undefined, prices: Object.fromEntries(Object.entries(v.prices ?? {}).map(([cur, amount]) => [cur, money(amount as number, cur as CurrencyCode)])), availability: availabilityOf(rec, info), availableQty: info.tracked ? info.available : undefined, imageIndex: v.imageIndex,
          optionValues: Object.fromEntries(rec.options.map((o) => [pick(o.label, locale), pick(o.values.find((x) => x.id === v.optionValues[o.key])?.label ?? { fr: "", ht: "" }, locale)])),
        };
      })
    : [];

  const attributes: Product["attributes"] = {};
  const specifications: Product["specifications"] = [];
  for (const def of category?.attributes ?? []) {
    const raw = rec.attributes[def.key];
    if (!raw) continue;
    const label = pick(def.label, locale);
    if (def.type === "select") {
      const opt = def.options.find((o) => o.id === raw);
      if (!opt) continue;
      specifications.push({ label, value: pick(opt.label, locale) });
      if (def.filterable) attributes[def.key] = { id: opt.id, label: pick(opt.label, locale), name: label };
    } else specifications.push({ label, value: def.type === "number" && def.unit ? `${raw} ${def.unit}` : raw });
  }

  const description = pick(rec.description, locale).split(/\n\n+/).filter(Boolean);
  const images = rec.images.length
    ? rec.images.map((i, n) => ({ src: i.src, alt: i.src.startsWith("/sample/") ? sampleAlt(locale, n === 0 ? name : `${name} (${n + 1})`) : n === 0 ? name : `${name} (${n + 1})` }))
    : [{ src: PLACEHOLDER_IMAGE, alt: name }];

  return {
    id: rec.id, slug: rec.slug, sku: rec.sku, name, description, categorySlug: rec.categorySlug, categoryName: category ? pick(category.name, locale) : "", brand: rec.brand,
    price: primaryOffer?.price ?? money(0, market.defaultProductCurrency), compareAtPrice: primaryOffer?.compareAtPrice, offers,
    images, availability, availableQty: total.tracked ? total.available : undefined, options, variants, attributes, specifications, isNew: rec.isNew,
    createdAt: rec.createdAt, featuredRank: rec.featuredRank, relatedIds: rec.relatedIds, unit: rec.unit, unitNote: pick(rec.unitNote, locale) || undefined,
    pricing: primary ?? { currency: market.defaultProductCurrency, retail: 0, wholesale: { enabled: false, tiers: [] } }, minOrderQty: primaryOffer?.minOrderQty ?? 1, hasWholesale: primaryOffer?.hasWholesale ?? false,
  };
}
