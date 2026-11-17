import type { Locale } from "@/i18n/config";
import type { Availability, Category, Product, ProductImage, ProductOffer, ProductVariant } from "../catalog-types";
import { type Pricing, type UnitId, unitIds } from "../catalog/model";
import type { Money } from "../money";
import { decimalToMinor } from "./decimal";
import type { AttributeDto, AvailabilityDto, CategoryDto, LTextDto, PriceDto, ProductDto } from "./dto";

/** Neutral artwork shown when a product (or category) has no usable image. It is not a product photo. */
export const PLACEHOLDER_IMAGE = "/sample/placeholder.svg";

/** The language asked for, else the other one: a product the seller only translated into one language still shows. */
export const pickText = (text: LTextDto | null | undefined, locale: Locale): string => (text?.[locale] || text?.fr || text?.ht || "").trim();

/**
 * Only http(s) URLs are ever used as image sources (the API sends the public R2 URL). Anything else — `javascript:`, `data:`, relative junk,
 * a missing value — falls back to the placeholder instead of being rendered.
 */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const AVAILABILITY: Record<AvailabilityDto, Availability> = { IN_STOCK: "in_stock", LOW_STOCK: "low_stock", OUT_OF_STOCK: "out_of_stock", UNTRACKED_AVAILABLE: "in_stock" };
// An availability value this client does not know is shown as unavailable: never promise stock the API did not state.
const availabilityOf = (a: string): Availability => (AVAILABILITY as Record<string, Availability | undefined>)[a] ?? "out_of_stock";
const qtyOf = (n: number | null | undefined): number | undefined => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined);

export function toCategory(dto: CategoryDto, locale: Locale): Category {
  const name = pickText(dto.name, locale) || dto.slug;
  return { slug: dto.slug, name, description: pickText(dto.description, locale), image: { src: safeImageUrl(dto.imageUrl) ?? PLACEHOLDER_IMAGE, alt: name } };
}

/** One currency block -> `Pricing` in minor units; null when any retail/sale amount is malformed (that currency is then simply not offered). */
function toPricing(price: PriceDto): Pricing | null {
  const retail = decimalToMinor(price.retailPrice, price.currency);
  if (retail === null) return null;
  const sale = price.salePrice === null || price.salePrice === undefined ? undefined : decimalToMinor(price.salePrice, price.currency);
  if (sale === null) return null;
  const tiers = (price.wholesaleTiers ?? []).map((t) => ({ minQty: t.minQuantity, unitPrice: decimalToMinor(t.unitPrice, price.currency) }));
  // A malformed tier must not show a wrong discount: wholesale is left out for that currency instead.
  const tiersValid = tiers.every((t): t is { minQty: number; unitPrice: number } => t.unitPrice !== null && Number.isInteger(t.minQty) && t.minQty > 0);
  return {
    currency: price.currency as Pricing["currency"],
    retail,
    sale,
    wholesale: { enabled: price.wholesaleEnabled && tiersValid && tiers.length > 0, tiers: tiersValid ? tiers : [] },
    minOrderQty: price.minOrderQuantity && price.minOrderQuantity > 1 ? price.minOrderQuantity : undefined,
  };
}

const money = (value: string, currency: string): Money | null => {
  const amount = decimalToMinor(value, currency);
  return amount === null ? null : { amount, currency };
};

const attributeById = (category: CategoryDto | undefined): Map<string, AttributeDto> => new Map((category?.attributes ?? []).map((a) => [a.id, a]));

/**
 * Backend product -> the localized shape the storefront renders. `category` (the DETAIL response, with attributes) gives variant options and
 * specifications their names; without it (list cards) variants are still detected but their option names are the attribute ids and no
 * specifications are produced, which the card never displays. Returns null when the product has no price this client can read.
 */
export function toProduct(dto: ProductDto, locale: Locale, category?: CategoryDto, categoryName?: string): Product | null {
  const name = pickText(dto.name, locale) || dto.sku;
  const pricings = dto.prices.map((p) => toPricing(p)).filter((p): p is Pricing => p !== null);
  if (pricings.length === 0) return null;

  const variantsDto = dto.variants ?? [];
  const attrs = attributeById(category);
  const variantOwn = (variantId: string, currency: string): Money | undefined => {
    const row = variantsDto.find((v) => v.id === variantId)?.retailPrices.find((p) => p.currency === currency);
    return row ? (money(row.retailPrice, currency) ?? undefined) : undefined;
  };

  const offers: ProductOffer[] = pricings.map((pricing) => {
    const onSale = pricing.sale !== undefined && pricing.sale < pricing.retail;
    return {
      currency: pricing.currency,
      price: { amount: onSale ? (pricing.sale as number) : pricing.retail, currency: pricing.currency },
      compareAtPrice: onSale ? { amount: pricing.retail, currency: pricing.currency } : undefined,
      pricing,
      minOrderQty: Math.max(1, pricing.minOrderQty ?? 1),
      hasWholesale: pricing.wholesale.enabled,
      variantPrices: Object.fromEntries(variantsDto.map((v) => [v.id, variantOwn(v.id, pricing.currency)] as const).filter((e): e is [string, Money] => e[1] !== undefined)),
    };
  });
  const primary = offers[0];

  // Variant options: one per attribute used as an axis by at least one variant, in category order when known.
  const axisIds = [...new Set(variantsDto.flatMap((v) => Object.keys(v.axisValues ?? {})))];
  const axisOrder = (id: string) => attrs.get(id)?.displayOrder ?? Number.MAX_SAFE_INTEGER;
  axisIds.sort((a, b) => axisOrder(a) - axisOrder(b));
  const optionName = (axisId: string) => (attrs.get(axisId) ? pickText(attrs.get(axisId)!.label, locale) : axisId);
  const optionLabel = (axisId: string, optionId: string) => {
    const o = attrs.get(axisId)?.options.find((x) => x.id === optionId);
    return o ? pickText(o.label, locale) || o.code : optionId;
  };
  const options = axisIds.map((axisId) => ({
    name: optionName(axisId),
    values: [...new Set(variantsDto.map((v) => v.axisValues?.[axisId]).filter((x): x is string => Boolean(x)))].map((optionId) => ({ value: optionLabel(axisId, optionId) })),
  }));

  const variants: ProductVariant[] = variantsDto.map((v) => {
    const own = Object.fromEntries(offers.flatMap((o) => (o.variantPrices[v.id] ? [[o.currency, o.variantPrices[v.id]] as const] : [])));
    return {
      id: v.id,
      sku: v.sku,
      optionValues: Object.fromEntries(axisIds.filter((a) => v.axisValues?.[a]).map((a) => [optionName(a), optionLabel(a, v.axisValues[a])])),
      price: primary && own[primary.currency],
      prices: Object.keys(own).length ? own : undefined,
      availability: availabilityOf(v.availability),
      availableQty: qtyOf(v.availableQuantity),
    };
  });

  const attributes: Product["attributes"] = {};
  const specifications: Product["specifications"] = [];
  for (const value of dto.attributes ?? []) {
    const def = attrs.get(value.attributeId);
    if (!def) continue;
    const label = pickText(def.label, locale);
    if (def.type === "CHOICE") {
      const option = def.options.find((o) => o.id === value.optionId);
      if (!option) continue;
      const optionText = pickText(option.label, locale) || option.code;
      specifications.push({ label, value: optionText });
      if (def.filterable) attributes[def.key] = { id: option.code, label: optionText, name: label };
    } else if (def.type === "NUMBER" && value.number !== null && value.number !== undefined) {
      specifications.push({ label, value: def.unit ? `${value.number} ${def.unit}` : String(value.number) });
    } else if (def.type === "TEXT" && value.text) {
      specifications.push({ label, value: value.text });
    }
  }

  const images: ProductImage[] = [...(dto.images ?? [])]
    .sort((a, b) => a.position - b.position)
    .flatMap((img, n) => {
      const src = safeImageUrl(img.url);
      return src ? [{ src, alt: pickText(img.alt, locale) || (n === 0 ? name : `${name} (${n + 1})`) }] : [];
    });

  const unit = dto.sellingUnit.toLowerCase();
  return {
    id: dto.id, slug: dto.slug, sku: dto.sku, name,
    description: pickText(dto.description, locale).split(/\n\n+/).filter(Boolean),
    categorySlug: dto.categorySlug,
    categoryName: categoryName ?? (category ? pickText(category.name, locale) : ""),
    brand: dto.brand?.trim() || undefined,
    price: primary.price, compareAtPrice: primary.compareAtPrice, offers,
    images: images.length ? images : [{ src: PLACEHOLDER_IMAGE, alt: name }],
    availability: availabilityOf(dto.availability),
    availableQty: qtyOf(dto.availableQuantity),
    options, variants, attributes, specifications,
    createdAt: dto.createdAt,
    featuredRank: 0,
    unit: (unitIds as readonly string[]).includes(unit) ? (unit as UnitId) : "unit",
    unitNote: pickText(dto.unitNote, locale) || undefined,
    pricing: primary.pricing, minOrderQty: primary.minOrderQty, hasWholesale: primary.hasWholesale,
  };
}
