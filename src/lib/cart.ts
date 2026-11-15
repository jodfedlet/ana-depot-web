import type { UnitId } from "./catalog/model";
import { type PriceKind, type PricingSnapshot, snapshotFor, unitPriceFor } from "./catalog/pricing";
import type { Availability, Product, ProductVariant } from "./catalog-types";
import { type Money, multiplyMoney, sumByCurrency } from "./money";

/** Sanity cap for typed quantities (wholesale buyers order large amounts). Real limits come from stock. */
export const MAX_QUANTITY = 99999;

/**
 * A cart line stores a snapshot of the product's pricing rules, so changing the quantity re-prices the line
 * (retail → wholesale tiers) without a request. The backend must re-validate price and stock when reserving.
 */
export interface CartLine {
  key: string; // productId[:variantId]
  productId: string;
  variantId?: string;
  slug: string;
  name: string;
  variantLabel?: string;
  image: { src: string; alt: string };
  unit: UnitId;
  unitNote?: string;
  pricing: PricingSnapshot;
  /** Unit price that applies at the current quantity. */
  unitPrice: Money;
  priceKind: PriceKind;
  quantity: number;
  availability: Availability;
  /** Reservable units when stock is tracked; undefined = no stock limit. */
  maxQuantity?: number;
}

export const lineKey = (productId: string, variantId?: string) => (variantId ? `${productId}:${variantId}` : productId);

export const variantLabel = (variant: ProductVariant): string =>
  Object.entries(variant.optionValues).map(([k, v]) => `${k} : ${v}`).join(" · ");

const clampQty = (line: Pick<CartLine, "pricing" | "maxQuantity">, q: number) =>
  Math.max(line.pricing.minQty, Math.min(line.maxQuantity ?? MAX_QUANTITY, Math.floor(Number.isFinite(q) ? q : 1)));

function priced(line: CartLine, quantity: number): CartLine {
  const q = clampQty(line, quantity);
  const p = unitPriceFor(line.pricing, q);
  // The price keeps the currency of the product's pricing snapshot: re-pricing by quantity never changes currency.
  return { ...line, quantity: q, unitPrice: { amount: p.unitPrice, currency: line.pricing.currency }, priceKind: p.kind };
}

export function buildCartLine(product: Product, variant: ProductVariant | undefined, quantity: number): CartLine {
  const imageIndex = variant?.imageIndex ?? 0;
  const pricing = snapshotFor(product.pricing, variant?.price?.amount);
  const base: CartLine = {
    key: lineKey(product.id, variant?.id), productId: product.id, variantId: variant?.id, slug: product.slug, name: product.name,
    variantLabel: variant ? variantLabel(variant) : undefined, image: product.images[imageIndex] ?? product.images[0], unit: product.unit, unitNote: product.unitNote,
    pricing, unitPrice: { amount: pricing.base, currency: pricing.currency }, priceKind: "retail", quantity: 1,
    availability: variant?.availability ?? product.availability, maxQuantity: variant?.availableQty ?? product.availableQty,
  };
  return priced(base, quantity);
}

export type CartAction =
  | { type: "add"; line: CartLine }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "remove"; key: string }
  | { type: "clear" };

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add": {
      const existing = lines.find((l) => l.key === action.line.key);
      if (existing) {
        // Refresh pricing/stock from the newest snapshot, then add the quantity and re-price.
        const merged: CartLine = { ...action.line, quantity: existing.quantity };
        return lines.map((l) => (l.key === existing.key ? priced(merged, existing.quantity + action.line.quantity) : l));
      }
      return [...lines, priced(action.line, action.line.quantity)];
    }
    case "setQuantity":
      return lines.map((l) => (l.key === action.key ? priced(l, action.quantity) : l));
    case "remove":
      return lines.filter((l) => l.key !== action.key);
    case "clear":
      return [];
  }
}

export const cartItemCount = (lines: CartLine[]): number => lines.length;

export const lineTotal = (line: CartLine): Money => multiplyMoney(line.unitPrice, line.quantity);

/**
 * Subtotals per currency (empty for an empty cart). A cart may hold products priced in HTG and in USD: each currency is
 * totalled separately and never converted or merged.
 */
export function cartSubtotals(lines: CartLine[]): Money[] {
  return sumByCurrency(lines.map(lineTotal));
}
