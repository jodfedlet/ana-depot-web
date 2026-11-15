import type { Availability, Product, ProductVariant } from "./catalog-types";
import type { Money } from "./money";

/** Visual tone per availability. The label is translated via `availability.<state>` messages. */
export const availabilityTone: Record<Availability, "success" | "warning" | "danger" | "info"> = {
  in_stock: "success",
  low_stock: "warning",
  out_of_stock: "danger",
  preorder: "info",
};

export const hasVariants = (p: Product) => p.options.length > 0 && p.variants.length > 0;

/** Lowest price across variants, and whether variants differ ("From …"). */
export function displayPrice(p: Product): { price: Money; from: boolean } {
  if (!hasVariants(p)) return { price: p.price, from: false };
  const prices = p.variants.map((v) => v.price ?? p.price);
  const min = prices.reduce((a, b) => (b.amount < a.amount ? b : a));
  return { price: min, from: prices.some((x) => x.amount !== min.amount) };
}

/** Whether the product can be bought at all (any variant available counts). */
export function isPurchasable(p: Product): boolean {
  if (hasVariants(p)) return p.variants.some((v) => v.availability !== "out_of_stock");
  return p.availability !== "out_of_stock";
}

export function findVariant(p: Product, selection: Record<string, string>): ProductVariant | undefined {
  return p.variants.find((v) => p.options.every((o) => v.optionValues[o.name] === selection[o.name]));
}

/** Is any variant with this option value (given other current selections) still purchasable? */
export function optionValueAvailable(p: Product, optionName: string, value: string, selection: Record<string, string>): boolean {
  return p.variants.some(
    (v) =>
      v.optionValues[optionName] === value &&
      Object.entries(selection).every(([k, val]) => k === optionName || !val || v.optionValues[k] === val) &&
      v.availability !== "out_of_stock",
  );
}
