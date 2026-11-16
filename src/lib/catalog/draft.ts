import { market } from "@/config/market";
import { type LText, L, pick } from "../localized";
import { type CurrencyCode, SUPPORTED_CURRENCIES, majorToMinor, minorToMajor } from "../money";
import { validatePricing } from "./pricing";
import {
  type AttributeDef, type CategoryRecord, type Pricing, pricingIn, type ManualAvailability, type ProductRecord, type ProductStatus, type UnitId, type VariantOption, type VariantRecord,
} from "./model";

/** String-based form state for the product editor (inputs are strings; conversion happens on save). */
export interface DraftOptionValue { id: string; fr: string; ht: string; swatch?: string }
export interface DraftOption { key: string; fr: string; ht: string; values: DraftOptionValue[] }
/**
 * The price editor state for ONE currency. A product has an independent one per supported currency; only `enabled` ones
 * are sold. Variants may override the retail price per currency (`DraftVariant.prices`). Stock is not here: it is shared.
 */
export interface DraftPrice {
  enabled: boolean;
  retail: string; sale: string; minOrderQty: string;
  wholesaleEnabled: boolean;
  tiers: { minQty: string; unitPrice: string }[];
}
export const emptyDraftPrice = (enabled = false): DraftPrice => ({ enabled, retail: "", sale: "", minOrderQty: "", wholesaleEnabled: false, tiers: [] });
export const emptyDraftPrices = (): Record<CurrencyCode, DraftPrice> => ({ HTG: emptyDraftPrice(), USD: emptyDraftPrice() });
export interface DraftVariant { id: string; sku: string; optionValues: Record<string, string>; prices: Record<CurrencyCode, string>; onHand: string; active: boolean; imageIndex?: number }
export interface DraftImage { id: string; src: string }

export interface ProductDraft {
  id?: string;
  status: ProductStatus;
  categorySlug: string;
  nameFr: string; nameHt: string;
  descFr: string; descHt: string;
  sku: string;
  brand: string;
  images: DraftImage[];
  attributes: Record<string, string>;
  hasVariants: boolean;
  options: DraftOption[];
  variants: DraftVariant[];
  unit: UnitId;
  unitNoteFr: string; unitNoteHt: string;
  /** One price set per supported currency — ONE product, independent prices, shared stock. */
  prices: Record<CurrencyCode, DraftPrice>;
  tracked: boolean;
  onHand: string;
  lowStock: string;
  manualAvailability: ManualAvailability;
}

export const emptyDraft = (categorySlug = ""): ProductDraft => ({
  status: "draft", categorySlug, nameFr: "", nameHt: "", descFr: "", descHt: "", sku: "", brand: "", images: [], attributes: {},
  hasVariants: false, options: [], variants: [], unit: "unit", unitNoteFr: "", unitNoteHt: "", prices: { ...emptyDraftPrices(), [market.defaultProductCurrency]: emptyDraftPrice(true) },
  tracked: true, onHand: "0", lowStock: "", manualAvailability: "in_stock",
});

const major = (minor: number | undefined, currency: CurrencyCode) => (minor === undefined ? "" : String(minorToMajor(minor, currency)));

export function recordToDraft(r: ProductRecord): ProductDraft {
  return {
    id: r.id, status: r.status, categorySlug: r.categorySlug, nameFr: r.name.fr, nameHt: r.name.ht, descFr: r.description.fr, descHt: r.description.ht,
    sku: r.sku, brand: r.brand ?? "", images: r.images.map((i, n) => ({ id: `img-${n}-${i.src.length}`, src: i.src })), attributes: { ...r.attributes },
    hasVariants: r.options.length > 0 && r.variants.length > 0,
    options: r.options.map((o) => ({ key: o.key, fr: o.label.fr, ht: o.label.ht, values: o.values.map((v) => ({ id: v.id, fr: v.label.fr, ht: v.label.ht, swatch: v.swatch })) })),
    variants: r.variants.map((v) => ({ id: v.id, sku: v.sku, optionValues: { ...v.optionValues }, prices: Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c, major(v.prices?.[c], c)])) as Record<CurrencyCode, string>, onHand: String(v.onHand), active: v.active, imageIndex: v.imageIndex })),
    unit: r.unit, unitNoteFr: r.unitNote.fr, unitNoteHt: r.unitNote.ht,
    prices: Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => {
      const pr = pricingIn(r, c);
      return [c, pr ? { enabled: true, retail: major(pr.retail, c), sale: major(pr.sale, c), minOrderQty: pr.minOrderQty ? String(pr.minOrderQty) : "", wholesaleEnabled: pr.wholesale.enabled, tiers: pr.wholesale.tiers.map((t) => ({ minQty: String(t.minQty), unitPrice: major(t.unitPrice, c) })) } : emptyDraftPrice()];
    })) as Record<CurrencyCode, DraftPrice>,
    tracked: r.inventory.tracked, onHand: String(r.inventory.onHand), lowStock: r.inventory.lowStockThreshold === undefined ? "" : String(r.inventory.lowStockThreshold),
    manualAvailability: r.inventory.manualAvailability,
  };
}

export const parseMoney = (s: string, currency: CurrencyCode): number | undefined => {
  const t = s.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? majorToMinor(n, currency) : NaN;
};
export const parseInteger = (s: string): number | undefined => {
  const t = s.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

export function slugify(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "produit";
}
export function uniqueSlug(base: string, taken: string[]): string {
  const root = slugify(base);
  if (!taken.includes(root)) return root;
  let i = 2;
  while (taken.includes(`${root}-${i}`)) i += 1;
  return `${root}-${i}`;
}

export type DraftErrors = Record<string, string>;

/**
 * Validates the editor state. `mode: "draft"` only needs enough to save work in progress;
 * `mode: "publish"` enforces everything a customer-facing product needs. Values are message keys
 * under `admin.products.errors.*`.
 */
export function validateDraft(d: ProductDraft, category: CategoryRecord | undefined, otherSkus: string[], mode: "draft" | "publish"): DraftErrors {
  const e: DraftErrors = {};
  const publish = mode === "publish";
  if (!d.nameFr.trim() && !d.nameHt.trim()) e.name = "nameRequired";
  const skus = [d.sku.trim(), ...d.variants.map((v) => v.sku.trim())].filter(Boolean);
  if (publish && !d.sku.trim()) e.sku = "skuRequired";
  if (d.sku.trim() && otherSkus.includes(d.sku.trim())) e.sku = "skuDuplicate";
  if (publish && !d.categorySlug) e.category = "categoryRequired";
  const enabled = SUPPORTED_CURRENCIES.filter((c) => d.prices[c]?.enabled);
  if (publish && enabled.length === 0) e.prices = "priceRequired";
  for (const cur of enabled) {
    const dp = d.prices[cur];
    // Every currency is validated on its own; amounts are parsed in THAT currency and never compared with another one.
    if (!(publish || dp.retail.trim())) continue;
    const tiers = dp.tiers.map((t) => ({ minQty: parseInteger(t.minQty), unitPrice: parseMoney(t.unitPrice, cur) }));
    for (const issue of validatePricing({ retail: parseMoney(dp.retail, cur), sale: parseMoney(dp.sale, cur), minOrderQty: parseInteger(dp.minOrderQty), wholesaleEnabled: dp.wholesaleEnabled, tiers })) {
      if (issue.index !== undefined) e[`price.${cur}.tier.${issue.index}.${issue.code}`] = issue.code;
      else if (issue.code === "retailInvalid") e[`price.${cur}.retail`] = issue.code;
      else if (issue.code === "saleInvalid") e[`price.${cur}.sale`] = issue.code;
      else if (issue.code === "minOrderInvalid") e[`price.${cur}.minOrderQty`] = issue.code;
      else e[`price.${cur}.tiers`] = issue.code;
    }
  }
  if (publish && category) {
    for (const a of category.attributes) if (a.required && !(d.attributes[a.key] ?? "").trim()) e[`attr.${a.key}`] = "attrRequired";
  }
  for (const a of category?.attributes ?? []) {
    const v = (d.attributes[a.key] ?? "").trim();
    if (a.type === "number" && v && !Number.isFinite(Number(v.replace(",", ".")))) e[`attr.${a.key}`] = "attrNumber";
  }
  if (d.hasVariants) {
    if (d.options.length === 0 || d.options.some((o) => !(o.fr.trim() || o.ht.trim()) || o.values.length === 0 || o.values.some((v) => !(v.fr.trim() || v.ht.trim())))) e.options = "optionsInvalid";
    if (publish && d.variants.filter((v) => v.active).length === 0) e.variants = "variantsRequired";
    d.variants.forEach((v, i) => {
      if (publish && !v.sku.trim()) e[`variant.${i}.sku`] = "skuRequired";
      else if (v.sku.trim() && (otherSkus.includes(v.sku.trim()) || skus.filter((s) => s === v.sku.trim()).length > 1)) e[`variant.${i}.sku`] = "skuDuplicate";
      for (const cur of enabled) {
        const typed = v.prices[cur] ?? "";
        const p = parseMoney(typed, cur);
        if (typed.trim() && !(p !== undefined && p > 0)) e[`variant.${i}.price.${cur}`] = "variantPrice";
      }
      if (d.tracked) { const n = parseInteger(v.onHand); if (!(n !== undefined && Number.isInteger(n) && n >= 0)) e[`variant.${i}.onHand`] = "stockInvalid"; }
    });
  } else if (d.tracked) {
    const n = parseInteger(d.onHand);
    if (!(n !== undefined && Number.isInteger(n) && n >= 0)) e.onHand = "stockInvalid";
  }
  if (d.lowStock.trim()) { const n = parseInteger(d.lowStock); if (!(n !== undefined && Number.isInteger(n) && n >= 0)) e.lowStock = "stockInvalid"; }
  return e;
}

/** Variant overrides for the currencies the product is actually sold in (a disabled currency's typed values are dropped). */
function variantPrices(v: DraftVariant, enabled: CurrencyCode[]): Partial<Record<CurrencyCode, number>> | undefined {
  const entries = enabled.map((c) => [c, parseMoney(v.prices[c] ?? "", c) || undefined] as const).filter((x): x is readonly [CurrencyCode, number] => x[1] !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function toPricing(dp: DraftPrice, cur: CurrencyCode): Pricing {
  const tiers = dp.wholesaleEnabled ? dp.tiers.map((t) => ({ minQty: parseInteger(t.minQty) || 0, unitPrice: parseMoney(t.unitPrice, cur) || 0 })).sort((a, b) => a.minQty - b.minQty) : [];
  return { currency: cur, retail: parseMoney(dp.retail, cur) || 0, sale: parseMoney(dp.sale, cur) || undefined, wholesale: { enabled: dp.wholesaleEnabled, tiers }, minOrderQty: parseInteger(dp.minOrderQty) || undefined };
}

export function draftToRecord(d: ProductDraft, ctx: { id: string; slug: string; now: string; createdAt?: string; featuredRank?: number; isNew?: boolean; relatedIds?: string[]; isSample?: boolean }): ProductRecord {
  const enabled = SUPPORTED_CURRENCIES.filter((c) => d.prices[c]?.enabled);
  const hasV = d.hasVariants && d.options.length > 0;
  const options: VariantOption[] = hasV ? d.options.map((o) => ({ key: o.key, label: L(o.fr, o.ht), values: o.values.map((v) => ({ id: v.id, label: L(v.fr, v.ht), swatch: v.swatch })) })) : [];
  const variants: VariantRecord[] = hasV ? d.variants.map((v) => ({ id: v.id, sku: v.sku.trim(), optionValues: v.optionValues, prices: variantPrices(v, enabled), onHand: d.tracked ? Math.max(0, parseInteger(v.onHand) || 0) : 0, imageIndex: v.imageIndex, active: v.active })) : [];
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(d.attributes)) if (v.trim()) attrs[k] = v.trim();
  return {
    id: ctx.id, slug: ctx.slug, sku: d.sku.trim(), name: L(d.nameFr.trim(), d.nameHt.trim()), description: L(d.descFr.trim(), d.descHt.trim()),
    categorySlug: d.categorySlug, brand: d.brand.trim() || undefined, images: d.images.map((i) => ({ src: i.src })), status: d.status, unit: d.unit,
    unitNote: L(d.unitNoteFr.trim(), d.unitNoteHt.trim()), attributes: attrs, options, variants,
    prices: enabled.map((cur) => toPricing(d.prices[cur], cur)),
    inventory: { tracked: d.tracked, onHand: d.tracked && !hasV ? Math.max(0, parseInteger(d.onHand) || 0) : 0, lowStockThreshold: parseInteger(d.lowStock), manualAvailability: d.manualAvailability },
    isNew: ctx.isNew, createdAt: ctx.createdAt ?? ctx.now, updatedAt: ctx.now, featuredRank: ctx.featuredRank ?? 999, relatedIds: ctx.relatedIds, isSample: ctx.isSample,
  };
}

/** Cartesian product of option values, keeping SKU/price/stock of combinations that already exist. */
export function generateVariants(options: DraftOption[], existing: DraftVariant[], skuBase: string): DraftVariant[] {
  const usable = options.filter((o) => o.values.length > 0);
  if (usable.length === 0) return [];
  let combos: Record<string, string>[] = [{}];
  for (const o of usable) combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.key]: v.id })));
  const sameCombo = (a: Record<string, string>, b: Record<string, string>) => usable.every((o) => a[o.key] === b[o.key]);
  return combos.map((c, i) => {
    const found = existing.find((v) => sameCombo(v.optionValues, c));
    if (found) return { ...found, optionValues: c };
    const suffix = usable.map((o) => o.values.find((v) => v.id === c[o.key])?.id ?? "").join("-").toUpperCase();
    return { id: `v-${Date.now().toString(36)}-${i}`, sku: skuBase ? `${skuBase}-${suffix}` : "", optionValues: c, prices: { HTG: "", USD: "" }, onHand: "0", active: true };
  });
}

export const variantLabel = (v: { optionValues: Record<string, string> }, options: DraftOption[], locale: "fr" | "ht") =>
  options.map((o) => { const val = o.values.find((x) => x.id === v.optionValues[o.key]); return val ? (locale === "fr" ? val.fr || val.ht : val.ht || val.fr) : ""; }).filter(Boolean).join(" · ");

export const attrLabel = (a: AttributeDef, locale: "fr" | "ht") => pick(a.label, locale);
export type { LText };
