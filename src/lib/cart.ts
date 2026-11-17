import type { UnitId } from "./catalog/model";
import { type PriceKind, type PricingSnapshot, snapshotFor, unitPriceFor } from "./catalog/pricing";
import { inCurrency } from "./catalog/offers";
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

/** One cart line per product/variant AND currency: the same item in HTG and in USD are two lines (two prices), sharing one stock. */
export const lineKey = (productId: string, variantId: string | undefined, currency: string) => `${variantId ? `${productId}:${variantId}` : productId}@${currency}`;

const sameItem = (a: Pick<CartLine, "productId" | "variantId">, b: Pick<CartLine, "productId" | "variantId">) => a.productId === b.productId && a.variantId === b.variantId;
/** Units of the same stock position already taken by the OTHER currency lines of this item. */
const takenByOthers = (lines: CartLine[], line: CartLine) => lines.filter((l) => l.key !== line.key && sameItem(l, line)).reduce((n, l) => n + l.quantity, 0);

export const variantLabel = (variant: ProductVariant): string =>
  Object.entries(variant.optionValues).map(([k, v]) => `${k} : ${v}`).join(" · ");

const clampQty = (line: Pick<CartLine, "pricing" | "maxQuantity">, q: number, cap = line.maxQuantity) =>
  Math.max(line.pricing.minQty, Math.min(cap ?? MAX_QUANTITY, Math.floor(Number.isFinite(q) ? q : 1)));

function priced(line: CartLine, quantity: number, cap = line.maxQuantity): CartLine {
  const q = clampQty(line, quantity, cap);
  const p = unitPriceFor(line.pricing, q);
  // The price keeps the currency of the product's pricing snapshot: re-pricing by quantity never changes currency.
  return { ...line, quantity: q, unitPrice: { amount: p.unitPrice, currency: line.pricing.currency }, priceKind: p.kind };
}

/** Stock still free for this line once the other-currency lines of the same item are counted (undefined = no limit). */
const shareCap = (lines: CartLine[], line: CartLine): number | undefined => (line.maxQuantity === undefined ? undefined : Math.max(0, line.maxQuantity - takenByOthers(lines, line)));
export const sharedRoom = shareCap;

export function buildCartLine(product: Product, variant: ProductVariant | undefined, quantity: number): CartLine {
  const imageIndex = variant?.imageIndex ?? 0;
  const pricing = snapshotFor(product.pricing, variant?.price?.amount);
  const base: CartLine = {
    key: lineKey(product.id, variant?.id, pricing.currency), productId: product.id, variantId: variant?.id, slug: product.slug, name: product.name,
    variantLabel: variant ? variantLabel(variant) : undefined, image: product.images[imageIndex] ?? product.images[0], unit: product.unit, unitNote: product.unitNote,
    pricing, unitPrice: { amount: pricing.base, currency: pricing.currency }, priceKind: "retail", quantity: 1,
    availability: variant?.availability ?? product.availability, maxQuantity: variant?.availableQty ?? product.availableQty,
  };
  return priced(base, quantity);
}

export type CartAction =
  | { type: "add"; line: CartLine }
  | { type: "replace"; lines: CartLine[] }
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
        return lines.map((l) => (l.key === existing.key ? priced(merged, existing.quantity + action.line.quantity, shareCap(lines, merged)) : l));
      }
      return [...lines, priced(action.line, action.line.quantity, shareCap(lines, action.line))];
    }
    case "replace":
      return action.lines;
    case "setQuantity":
      return lines.map((l) => (l.key === action.key ? priced(l, action.quantity, shareCap(lines, l)) : l));
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

export type LineCheck =
  | { kind: "ok"; line: CartLine }
  | { kind: "unavailable" }
  | { kind: "insufficient"; available: number }
  | { kind: "changed"; line: CartLine; before: Money; after: Money };

/**
 * Compares a cart line with the product as the API describes it NOW and returns the line rebuilt from the current prices (quantity kept, never
 * clamped here: shortages are reported, not hidden). `demand` is the total quantity of this stock position across the cart's currency lines,
 * because HTG and USD lines of one item share one stock. The cart itself is never the source of truth for prices or stock.
 */
export function checkLine(line: CartLine, product: Product | undefined, demand: number): LineCheck {
  const sellable = product ? inCurrency(product, line.pricing.currency) : null;
  if (!product || !sellable) return { kind: "unavailable" };
  // the variant of THIS currency's view: its own price in this currency (not the primary currency's) must be the one used
  const variant = line.variantId ? sellable.variants.find((v) => v.id === line.variantId) : undefined;
  if (line.variantId && !variant) return { kind: "unavailable" };
  if ((variant?.availability ?? product.availability) === "out_of_stock") return { kind: "unavailable" };
  const available = variant?.availableQty ?? product.availableQty;
  if (available !== undefined && demand > available) return { kind: "insufficient", available };
  const rebuilt = buildCartLine(sellable, variant, line.quantity);
  // Keep the quantity the customer chose; only prices, names and limits are refreshed.
  const fresh = priced({ ...rebuilt, quantity: line.quantity }, line.quantity, undefined);
  const priceMoved = fresh.unitPrice.amount !== line.unitPrice.amount || fresh.unitPrice.currency !== line.unitPrice.currency || JSON.stringify(fresh.pricing) !== JSON.stringify(line.pricing);
  return priceMoved ? { kind: "changed", line: fresh, before: line.unitPrice, after: fresh.unitPrice } : { kind: "ok", line: fresh };
}
