import type { Pricing, UnitId } from "./catalog/model";
import type { Money } from "./money";

/** Customer-facing, already-localized shapes. Editable records live in ./catalog/model.ts. */

export type Availability = "in_stock" | "low_stock" | "out_of_stock" | "preorder";

export interface ProductImage { src: string; alt: string }

export interface Category { slug: string; name: string; description: string; image: ProductImage }

export interface ProductOptionValue { value: string; swatch?: string }
export interface ProductOption { name: string; values: ProductOptionValue[] }

export interface ProductVariant {
  id: string;
  sku: string;
  /** option name -> value label (localized) */
  optionValues: Record<string, string>;
  /** Overrides the product retail price. */
  price?: Money;
  availability: Availability;
  /** Units a customer can still reserve (only when stock is tracked). */
  availableQty?: number;
  imageIndex?: number;
}

export interface AttributeValue {
  /** Stable value id (language independent, used in URLs). */
  id: string;
  label: string;
  /** Localized attribute name (the filter group title). */
  name: string;
}

export interface Product {
  id: string;
  slug: string;
  sku: string;
  name: string;
  description: string[];
  categorySlug: string;
  categoryName: string;
  brand?: string;
  /** Unit price below any wholesale tier (sale price if set, else retail). */
  price: Money;
  /** Retail price shown struck through when a promotion applies. */
  compareAtPrice?: Money;
  images: ProductImage[];
  availability: Availability;
  /** Units still reservable, when stock is tracked. */
  availableQty?: number;
  options: ProductOption[];
  variants: ProductVariant[];
  /** Filterable attribute values (select attributes the category marks as filterable). */
  attributes: Record<string, AttributeValue>;
  /** Display rows built from the category's attribute definitions. */
  specifications: { label: string; value: string }[];
  isNew?: boolean;
  createdAt: string;
  featuredRank: number;
  relatedIds?: string[];
  unit: UnitId;
  unitNote?: string;
  /** Raw pricing in minor units (tiers, minimum order). */
  pricing: Pricing;
  minOrderQty: number;
  hasWholesale: boolean;
}

export type SortKey = "featured" | "newest" | "price-asc" | "price-desc" | "name-asc";
export const sortKeys: SortKey[] = ["featured", "newest", "price-asc", "price-desc", "name-asc"];

export interface CatalogQuery {
  q?: string;
  category?: string;
  /** Only products priced in this currency. Required for price ranges when the catalog mixes currencies. */
  currency?: string;
  /** Minor units of the price currency (the selected currency, or the only one in scope). */
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  /** Only products that have wholesale (quantity) pricing. */
  wholesaleOnly?: boolean;
  brands?: string[];
  /** attribute key -> accepted value ids */
  attributes?: Record<string, string[]>;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface FacetGroup {
  key: string;
  name: string;
  values: { id: string; label: string; count: number }[];
}

export interface CatalogResult {
  products: Product[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  facets: FacetGroup[];
  brands: { value: string; count: number }[];
  /** Null when the products in scope use several currencies and none is selected: prices are never compared across currencies. */
  priceBounds: { min: number; max: number; currency: string } | null;
  /** Currencies present in scope (before the currency filter), with product counts. */
  currencies: { code: string; count: number }[];
  /** True when the results are sorted by price but contain several currencies (grouped by currency, never converted). */
  priceSortGrouped: boolean;
}
