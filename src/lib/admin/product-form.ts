import type { AdminAttribute, AdminCategory, AdminPrice, AdminProduct, ProductRequest } from "../api/admin/dto";
import { SUPPORTED_CURRENCIES } from "../money";
import { slugify } from "./slug";

/**
 * Form state of the product editor and its mapping to the API's `ProductRequest`. ONE product, ONE price block per currency (HTG and USD are independent
 * and nothing is converted), variants = combinations of the category's variant-axis attributes. Stock is NOT part of this form: it lives in inventory.
 * Prices are kept as the text the staff member typed and sent as decimal text; the server is the validator (these helpers only guide and never round).
 */
export const UNITS = ["UNIT", "PAIR", "PACK", "BOX", "SET", "METER", "KILOGRAM"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export interface TierForm { uid: string; minQty: string; unitPrice: string }
export interface PriceForm { enabled: boolean; retail: string; sale: string; minOrderQty: string; wholesaleEnabled: boolean; tiers: TierForm[] }
export interface VariantForm { uid: string; id?: string; sku: string; active: boolean; axisValues: Record<string, string>; overrides: Record<Currency, string> }
export interface AttributeValueForm { optionId: string; text: string; number: string }
export interface ProductForm {
  id?: string; version?: number; status: "DRAFT" | "ACTIVE" | "INACTIVE"; categoryId: string; nameFr: string; nameHt: string; descFr: string; descHt: string; sku: string; slug: string; brand: string;
  unit: (typeof UNITS)[number]; unitNoteFr: string; unitNoteHt: string; prices: Record<Currency, PriceForm>; variants: VariantForm[]; attributes: Record<string, AttributeValueForm>;
}

let n = 0;
const uid = () => `p${Date.now().toString(36)}${(n++).toString(36)}`;

export const emptyPrice = (enabled = false): PriceForm => ({ enabled, retail: "", sale: "", minOrderQty: "", wholesaleEnabled: false, tiers: [] });
export const emptyTier = (): TierForm => ({ uid: uid(), minQty: "", unitPrice: "" });
export const emptyVariant = (): VariantForm => ({ uid: uid(), sku: "", active: true, axisValues: {}, overrides: { HTG: "", USD: "" } });
export const emptyProductForm = (categoryId = ""): ProductForm => ({
  status: "DRAFT", categoryId, nameFr: "", nameHt: "", descFr: "", descHt: "", sku: "", slug: "", brand: "", unit: "UNIT", unitNoteFr: "", unitNoteHt: "",
  prices: { HTG: emptyPrice(true), USD: emptyPrice() }, variants: [], attributes: {},
});

const fromPrice = (p: AdminPrice): PriceForm => ({
  enabled: p.active, retail: p.retail, sale: p.sale ?? "", minOrderQty: p.minOrderQuantity > 1 ? String(p.minOrderQuantity) : "", wholesaleEnabled: p.wholesaleEnabled,
  tiers: [...p.tiers].sort((a, b) => a.minQuantity - b.minQuantity).map((t) => ({ uid: uid(), minQty: String(t.minQuantity), unitPrice: t.unitPrice })),
});

export function productToForm(p: AdminProduct): ProductForm {
  const prices = { HTG: emptyPrice(), USD: emptyPrice() } as Record<Currency, PriceForm>;
  for (const price of p.prices) if ((SUPPORTED_CURRENCIES as readonly string[]).includes(price.currency)) prices[price.currency as Currency] = fromPrice(price);
  const attributes: Record<string, AttributeValueForm> = {};
  for (const a of p.attributes) attributes[a.attributeId] = { optionId: a.optionId ?? "", text: a.text ?? "", number: a.number === null || a.number === undefined ? "" : String(a.number) };
  return {
    id: p.id, version: p.version, status: p.status, categoryId: p.categoryId, nameFr: p.name.fr ?? "", nameHt: p.name.ht ?? "", descFr: p.description.fr ?? "", descHt: p.description.ht ?? "",
    sku: p.sku ?? "", slug: p.slug ?? "", brand: p.brand ?? "", unit: (UNITS as readonly string[]).includes(p.unit) ? (p.unit as ProductForm["unit"]) : "UNIT", unitNoteFr: p.unitNote.fr ?? "", unitNoteHt: p.unitNote.ht ?? "",
    prices, attributes,
    variants: [...p.variants].sort((a, b) => a.position - b.position).map((v) => ({ uid: v.id, id: v.id, sku: v.sku ?? "", active: v.active, axisValues: { ...v.axisValues }, overrides: { HTG: v.retailOverrides?.HTG ?? "", USD: v.retailOverrides?.USD ?? "" } })),
  };
}

const trimmed = (s: string) => s.trim().replace(",", ".");
const intOrUndefined = (s: string) => { const t = s.trim(); return /^\d+$/.test(t) ? Number(t) : undefined; };

/** The request the form stands for. Only currencies that are switched on are sent; amounts are the typed decimal text (never rounded or converted here). */
export function formToRequest(f: ProductForm, opts: { status?: ProductForm["status"] } = {}): ProductRequest {
  const enabled = SUPPORTED_CURRENCIES.filter((c) => f.prices[c].enabled);
  return {
    version: f.id ? f.version : undefined,
    sku: f.sku.trim() || undefined,
    slug: f.id ? f.slug || undefined : f.slug.trim() || undefined,
    categoryId: f.categoryId,
    name: { fr: f.nameFr.trim(), ht: f.nameHt.trim() },
    description: { fr: f.descFr.trim(), ht: f.descHt.trim() },
    brand: f.brand.trim() || null,
    unit: f.unit,
    unitNote: { fr: f.unitNoteFr.trim(), ht: f.unitNoteHt.trim() },
    status: f.id ? undefined : opts.status ?? "DRAFT", // an existing product's status only changes through the lifecycle endpoint
    prices: enabled.map((c) => {
      const p = f.prices[c];
      return {
        currency: c,
        retail: trimmed(p.retail),
        sale: trimmed(p.sale) || null,
        minOrderQuantity: intOrUndefined(p.minOrderQty),
        wholesaleEnabled: p.wholesaleEnabled,
        tiers: p.wholesaleEnabled ? p.tiers.filter((t) => t.minQty.trim() || t.unitPrice.trim()).map((t) => ({ minQuantity: intOrUndefined(t.minQty) ?? Number.NaN, unitPrice: trimmed(t.unitPrice) })) : [],
        active: true,
      };
    }),
    variants: f.variants.map((v, i) => ({
      id: v.id, sku: v.sku.trim(), active: v.active, position: i + 1, axisValues: Object.fromEntries(Object.entries(v.axisValues).filter(([, o]) => o)),
      retailOverrides: Object.fromEntries(enabled.filter((c) => trimmed(v.overrides[c])).map((c) => [c, trimmed(v.overrides[c])])),
    })),
    attributes: Object.entries(f.attributes).flatMap(([attributeId, v]): ProductRequest["attributes"] => (v.optionId ? [{ attributeId, optionId: v.optionId }] : v.text.trim() ? [{ attributeId, text: v.text.trim() }] : v.number.trim() ? [{ attributeId, number: trimmed(v.number) }] : [])),
  };
}

/** Attributes of the category that define variants (choice attributes flagged as variant axes, still active), in the category's order. */
export const axesOf = (category: AdminCategory | undefined): AdminAttribute[] =>
  (category?.attributes ?? []).filter((a) => a.active && a.type === "CHOICE" && a.variantAxis).sort((a, b) => a.displayOrder - b.displayOrder);

/** Attributes the product form asks values for: everything active except the axes that currently define variants (those values live on the variants). */
export function productAttributesOf(category: AdminCategory | undefined, variants: VariantForm[]): AdminAttribute[] {
  const used = new Set(variants.flatMap((v) => Object.keys(v.axisValues).filter((k) => v.axisValues[k])));
  return (category?.attributes ?? []).filter((a) => a.active && !used.has(a.id)).sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Every combination of the axes' active options that is not already a variant (the "generate" helper). SKUs are PROPOSED from the product SKU and the option codes. */
export function missingCombinations(axes: AdminAttribute[], existing: VariantForm[], baseSku: string): VariantForm[] {
  if (axes.length === 0) return [];
  let combos: Record<string, string>[] = [{}];
  for (const axis of axes) {
    const options = axis.options.filter((o) => o.active);
    combos = combos.flatMap((c) => options.map((o) => ({ ...c, [axis.id]: o.id })));
  }
  const key = (a: Record<string, string>) => axes.map((x) => a[x.id] ?? "").join("|");
  const have = new Set(existing.map((v) => key(v.axisValues)));
  return combos.filter((c) => !have.has(key(c))).map((c) => ({
    ...emptyVariant(), axisValues: c,
    sku: [baseSku.trim(), ...axes.map((x) => x.options.find((o) => o.id === c[x.id])?.code ?? "")].filter(Boolean).join("-").toUpperCase(),
  }));
}

/** Light, language-free hints shown before sending (the server remains the validator): a price must look like a decimal amount. */
export const looksLikeAmount = (s: string): boolean => /^\d{1,12}([.,]\d{1,2})?$/.test(s.trim());
export const productSlugFor = (f: ProductForm): string => f.slug.trim() || slugify(f.nameFr || f.nameHt);
