import type { Product } from "../catalog-types";

/** Currencies the product is sold in, in display order (the first is the primary one). */
export const offerCurrencies = (product: Product): string[] => product.offers.map((o) => o.currency);

/**
 * The product as sold in ONE currency: price, compare-at price, pricing rules, minimum order and the variants' own
 * prices all come from that currency's offer. Returns null when the product is not sold in it — a missing currency is
 * never generated or converted from another one.
 */
export function inCurrency(product: Product, currency: string): Product | null {
  const offer = product.offers.find((o) => o.currency === currency);
  if (!offer) return null;
  return {
    ...product,
    price: offer.price,
    compareAtPrice: offer.compareAtPrice,
    pricing: offer.pricing,
    minOrderQty: offer.minOrderQty,
    hasWholesale: offer.hasWholesale,
    variants: product.variants.map((v) => ({ ...v, price: offer.variantPrices[v.id] })),
  };
}
