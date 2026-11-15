import type { Locale } from "@/i18n/config";
import type { Category, Product, ProductVariant } from "../catalog-types";
import { pick } from "../localized";
import { money } from "../money";
import type { Reservation } from "../reservations/types";
import { type CategoryRecord, type ProductRecord, hasVariantsRecord } from "./model";
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
  const availability = hasV && total.tracked && !rec.variants.some((v) => v.active && stockOf(rec, reservations, v.id).available > 0) ? "out_of_stock" : availabilityOf(rec, total);

  const options = rec.options.map((o) => ({ name: pick(o.label, locale), values: o.values.map((v) => ({ value: pick(v.label, locale), swatch: v.swatch })) }));
  const variants: ProductVariant[] = hasV
    ? rec.variants.filter((v) => v.active).map((v) => {
        const info = stockOf(rec, reservations, v.id);
        return {
          id: v.id, sku: v.sku, price: v.price !== undefined ? money(v.price, rec.pricing.currency) : undefined, availability: availabilityOf(rec, info), availableQty: info.tracked ? info.available : undefined, imageIndex: v.imageIndex,
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

  const sale = rec.pricing.sale !== undefined && rec.pricing.sale < rec.pricing.retail ? rec.pricing.sale : undefined;
  const description = pick(rec.description, locale).split(/\n\n+/).filter(Boolean);
  const images = rec.images.length
    ? rec.images.map((i, n) => ({ src: i.src, alt: i.src.startsWith("/sample/") ? sampleAlt(locale, n === 0 ? name : `${name} (${n + 1})`) : n === 0 ? name : `${name} (${n + 1})` }))
    : [{ src: PLACEHOLDER_IMAGE, alt: name }];

  return {
    id: rec.id, slug: rec.slug, sku: rec.sku, name, description, categorySlug: rec.categorySlug, categoryName: category ? pick(category.name, locale) : "", brand: rec.brand,
    price: money(sale ?? rec.pricing.retail, rec.pricing.currency), compareAtPrice: sale !== undefined ? money(rec.pricing.retail, rec.pricing.currency) : undefined,
    images, availability, availableQty: total.tracked ? total.available : undefined, options, variants, attributes, specifications, isNew: rec.isNew,
    createdAt: rec.createdAt, featuredRank: rec.featuredRank, relatedIds: rec.relatedIds, unit: rec.unit, unitNote: pick(rec.unitNote, locale) || undefined,
    pricing: rec.pricing, minOrderQty: Math.max(1, rec.pricing.minOrderQty ?? 1), hasWholesale: rec.pricing.wholesale.enabled && rec.pricing.wholesale.tiers.length > 0,
  };
}
