import type { CurrencyCode } from "../money";
import type { PriceTier, Pricing } from "./model";

/** Everything needed to price a line at any quantity, stored with cart lines and reservations. */
export interface PricingSnapshot {
  /** Currency of every amount below. A snapshot is never mixed-currency and never converted. */
  currency: CurrencyCode;
  /** Unit price below the first wholesale tier (sale price if any, else retail), minor units. */
  base: number;
  /** Price before any promotion (shown struck through when higher than base). */
  retail: number;
  tiers: PriceTier[];
  minQty: number;
}

export type PriceKind = "retail" | "sale" | "wholesale";

export interface UnitPrice {
  unitPrice: number;
  kind: PriceKind;
  tier?: PriceTier;
  /** The next tier the customer could reach, with the per-unit saving. */
  next?: { minQty: number; unitPrice: number; moreNeeded: number; saving: number };
}

export const sortTiers = (tiers: PriceTier[]) => [...tiers].sort((a, b) => a.minQty - b.minQty);

/**
 * Tiers are defined against the product's retail price. A variant with its OWN retail price gets the same
 * proportional reduction (e.g. 10% off at 5+ units applies to every size), so one tier table serves all variants.
 */
export function snapshotFor(pricing: Pricing, variantPrice?: number): PricingSnapshot {
  const retail = variantPrice ?? pricing.retail;
  const sale = variantPrice === undefined ? pricing.sale : undefined;
  const base = sale !== undefined && sale < retail ? sale : retail;
  const ratio = variantPrice !== undefined && pricing.retail > 0 ? variantPrice / pricing.retail : 1;
  const tiers = pricing.wholesale.enabled ? sortTiers(pricing.wholesale.tiers).map((t) => ({ minQty: t.minQty, unitPrice: ratio === 1 ? t.unitPrice : Math.round(t.unitPrice * ratio) })) : [];
  return { currency: pricing.currency, base, retail, tiers, minQty: Math.max(1, pricing.minOrderQty ?? 1) };
}

/** Wholesale tier prices never exceed the base price, even if a variant overrides the retail price below a tier. */
export function unitPriceFor(s: PricingSnapshot, qty: number): UnitPrice {
  let tier: PriceTier | undefined;
  for (const t of s.tiers) if (qty >= t.minQty) tier = t;
  const next = s.tiers.find((t) => t.minQty > qty);
  const nextInfo = next ? { minQty: next.minQty, unitPrice: Math.min(next.unitPrice, s.base), moreNeeded: next.minQty - qty, saving: s.base - Math.min(next.unitPrice, s.base) } : undefined;
  if (tier) return { unitPrice: Math.min(tier.unitPrice, s.base), kind: "wholesale", tier, next: nextInfo };
  return { unitPrice: s.base, kind: s.base < s.retail ? "sale" : "retail", next: nextInfo };
}

export const lineTotalFor = (s: PricingSnapshot, qty: number) => unitPriceFor(s, qty).unitPrice * qty;

export interface PriceRange { from: number; to?: number; unitPrice: number; kind: PriceKind }

/** Rows for the customer's "price by quantity" table. */
export function priceRanges(s: PricingSnapshot): PriceRange[] {
  const first = s.minQty;
  const base: PriceRange = { from: first, unitPrice: s.base, kind: s.base < s.retail ? "sale" : "retail" };
  const tiers = s.tiers.filter((t) => t.minQty > first);
  if (s.tiers.length && s.tiers[0].minQty <= first) {
    // wholesale applies from the very first allowed quantity
    return s.tiers.map((t, i) => ({ from: Math.max(t.minQty, first), to: s.tiers[i + 1] ? s.tiers[i + 1].minQty - 1 : undefined, unitPrice: Math.min(t.unitPrice, s.base), kind: "wholesale" as const }));
  }
  const out: PriceRange[] = [{ ...base, to: tiers[0] ? tiers[0].minQty - 1 : undefined }];
  tiers.forEach((t, i) => out.push({ from: t.minQty, to: tiers[i + 1] ? tiers[i + 1].minQty - 1 : undefined, unitPrice: Math.min(t.unitPrice, s.base), kind: "wholesale" }));
  return out;
}

export type PricingErrorCode =
  | "retailInvalid" | "saleInvalid" | "minOrderInvalid" | "tiersEmpty" | "tierQtyInvalid" | "tierPriceInvalid"
  | "tierOrder" | "tierPriceOrder" | "tierAboveBase";
export interface PricingIssue { code: PricingErrorCode; /** tier row index, when relevant */ index?: number }

/** Pure validation of pricing numbers (already parsed to minor units / integers). */
export function validatePricing(p: { retail?: number; sale?: number; minOrderQty?: number; wholesaleEnabled: boolean; tiers: { minQty?: number; unitPrice?: number }[] }): PricingIssue[] {
  const issues: PricingIssue[] = [];
  const int = (n?: number) => n !== undefined && Number.isInteger(n);
  if (!(p.retail !== undefined && p.retail > 0)) issues.push({ code: "retailInvalid" });
  if (p.sale !== undefined && !(p.sale > 0 && (p.retail === undefined || p.sale < p.retail))) issues.push({ code: "saleInvalid" });
  if (p.minOrderQty !== undefined && !(int(p.minOrderQty) && p.minOrderQty >= 1)) issues.push({ code: "minOrderInvalid" });
  if (!p.wholesaleEnabled) return issues;
  if (p.tiers.length === 0) issues.push({ code: "tiersEmpty" });
  const base = p.sale !== undefined && p.retail !== undefined && p.sale < p.retail ? p.sale : p.retail;
  p.tiers.forEach((t, i) => {
    if (!(int(t.minQty) && (t.minQty as number) >= 2)) issues.push({ code: "tierQtyInvalid", index: i });
    if (!(t.unitPrice !== undefined && t.unitPrice > 0)) issues.push({ code: "tierPriceInvalid", index: i });
    else if (base !== undefined && t.unitPrice >= base) issues.push({ code: "tierAboveBase", index: i });
    const prev = p.tiers[i - 1];
    if (prev && int(t.minQty) && int(prev.minQty) && (t.minQty as number) <= (prev.minQty as number)) issues.push({ code: "tierOrder", index: i });
    if (prev && t.unitPrice !== undefined && prev.unitPrice !== undefined && t.unitPrice >= prev.unitPrice && t.unitPrice < (base ?? Infinity)) issues.push({ code: "tierPriceOrder", index: i });
  });
  return issues;
}
