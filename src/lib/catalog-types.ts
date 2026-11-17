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
  /** Own price in the product's primary currency (see `prices` for every currency). */
  price?: Money;
  /** Own retail price per currency, when it differs from the product's. */
  prices?: Record<string, Money>;
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

/** One currency a product is sold in, with everything needed to price it. */
export interface ProductOffer {
  currency: string;
  /** Unit price below any wholesale tier (sale price if set, else retail). */
  price: Money;
  compareAtPrice?: Money;
  pricing: Pricing;
  minOrderQty: number;
  hasWholesale: boolean;
  /** Variant id -> that variant's own retail price in this currency. */
  variantPrices: Record<string, Money>;
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
  /** PRIMARY-currency view: unit price below any wholesale tier (sale price if set, else retail). See `offers` for every currency. */
  price: Money;
  /** Retail price shown struck through when a promotion applies (primary currency). */
  compareAtPrice?: Money;
  /** Every currency this product is sold in (one product, independent prices). The first is the primary one. */
  offers: ProductOffer[];
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
  /** Raw pricing in minor units (tiers, minimum order) — primary currency. */
  pricing: Pricing;
  minOrderQty: number;
  hasWholesale: boolean;
}

/** `relevance` is only offered with a text query (it is the API's ranking); without a key the API default applies (relevance with a query, newest without). */
export type SortKey = "relevance" | "newest" | "price-asc" | "price-desc" | "name-asc";
export const sortKeys: SortKey[] = ["relevance", "newest", "price-asc", "price-desc", "name-asc"];

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
  /** `count` is absent: the API does not return facet counts and none is computed here. */
  values: { id: string; label: string; count?: number }[];
}

/** One page of results exactly as the API returned it (order = the API's ranking/sort; `page` is 1-based here, zero-based on the wire). */
export interface CatalogResult {
  products: Product[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}
