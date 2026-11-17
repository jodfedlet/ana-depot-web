import type { CurrencyCode } from "../money";

/** Selling units (the API's `sellingUnit`, lower case) and the per-currency price rules the cart prices lines with (minor units). */
export const unitIds = ["unit", "pair", "pack", "box", "set", "meter", "kilogram"] as const;
export type UnitId = (typeof unitIds)[number];

export interface PriceTier { minQty: number; unitPrice: number }

/**
 * The price configuration of a product in ONE currency. Every amount is an integer in minor units of `currency`: retail, sale and wholesale tiers.
 * There is no conversion between currencies: HTG and USD prices are independent.
 */
export interface Pricing {
  currency: CurrencyCode;
  retail: number;
  /** Promotional price; must be below retail. */
  sale?: number;
  wholesale: { enabled: boolean; tiers: PriceTier[] };
  /** Smallest quantity per order line. */
  minOrderQty?: number;
}
