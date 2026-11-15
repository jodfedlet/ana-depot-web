import type { CurrencyCode } from "../money";
import type { LText } from "../localized";

/** Stored (editable) catalog records. Customer-facing, localized shapes live in ../catalog-types.ts. */

export const unitIds = ["unit", "pair", "pack", "box", "set", "meter", "kilogram"] as const;
export type UnitId = (typeof unitIds)[number];

export type AttributeType = "select" | "text" | "number";
export interface AttributeOption { id: string; label: LText }

/** A characteristic a CATEGORY offers (e.g. Length, Material). Products only carry values for their category's attributes. */
export interface AttributeDef {
  key: string;
  label: LText;
  type: AttributeType;
  /** Display unit for numbers (e.g. "mm", "cm"). */
  unit?: string;
  options: AttributeOption[];
  filterable: boolean;
  required: boolean;
  /** Suggest this attribute's options as a variant option (e.g. Size, Color). */
  variantAxis: boolean;
}

export interface CategoryRecord {
  slug: string;
  name: LText;
  description: LText;
  image?: string;
  active: boolean;
  order: number;
  attributes: AttributeDef[];
}

export interface OptionValue { id: string; label: LText; swatch?: string }
export interface VariantOption { key: string; label: LText; values: OptionValue[] }

export interface VariantRecord {
  id: string;
  sku: string;
  /** option key -> value id */
  optionValues: Record<string, string>;
  /** Overrides the product retail price (minor units). */
  price?: number;
  onHand: number;
  imageIndex?: number;
  active: boolean;
}

export interface PriceTier { minQty: number; unitPrice: number }

/**
 * Every amount here is an integer in minor units of `currency`: retail, sale, wholesale tiers and (through the product)
 * every variant price share ONE currency. There is no conversion between currencies.
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

export type ManualAvailability = "in_stock" | "out_of_stock" | "preorder";
export interface Inventory {
  tracked: boolean;
  /** Physical units when the product has no variants. */
  onHand: number;
  /** At or below this, the product is shown as low stock. Unset = no low-stock state. */
  lowStockThreshold?: number;
  /** Used only when stock is not tracked. */
  manualAvailability: ManualAvailability;
}

export type ProductStatus = "draft" | "active" | "inactive";

export interface ProductRecord {
  id: string;
  slug: string;
  sku: string;
  name: LText;
  description: LText;
  categorySlug: string;
  brand?: string;
  images: { src: string }[];
  status: ProductStatus;
  unit: UnitId;
  /** e.g. "6 pieces per pack". Free text, never used for conversions. */
  unitNote: LText;
  /** attribute key -> select option id, or free text/number as typed */
  attributes: Record<string, string>;
  options: VariantOption[];
  variants: VariantRecord[];
  pricing: Pricing;
  inventory: Inventory;
  isNew?: boolean;
  createdAt: string;
  updatedAt: string;
  featuredRank: number;
  relatedIds?: string[];
  isSample?: boolean;
}

export type StockMovementType = "initial" | "add" | "reduce" | "recount" | "sale";
export type StockReason = "reception" | "return" | "damage" | "loss" | "correction" | "count" | "sale" | "other";
export const stockReasons: StockReason[] = ["reception", "return", "damage", "loss", "correction", "count", "other"];

export interface StockMovement {
  id: string;
  productId: string;
  variantId?: string;
  type: StockMovementType;
  /** Signed change in physical units. */
  delta: number;
  balanceAfter: number;
  reason: StockReason;
  note?: string;
  at: string;
  by: string;
}

export const hasVariantsRecord = (p: Pick<ProductRecord, "options" | "variants">) => p.options.length > 0 && p.variants.length > 0;
