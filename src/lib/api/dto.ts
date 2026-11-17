/**
 * Wire shapes of the Ana Dépôt API as documented in `ana-depot-api/docs/api.md` ("what is implemented"). Only fields the storefront
 * reads are listed. Money is ALWAYS a decimal string next to an explicit currency; localized text is `{ fr, ht }` where either side may be missing.
 * These types describe what arrives over HTTP — screens use the view types in `catalog-types.ts` and `reservations/customer-view.ts`
 * (see `map-catalog.ts` / `map-reservation.ts`), never these.
 */

export interface LTextDto { fr?: string | null; ht?: string | null }

export interface PageDto<T> { items: T[]; page: number; size: number; totalItems: number; totalPages: number }

export interface OptionDto { id: string; code: string; label: LTextDto; displayOrder: number }
export interface AttributeDto {
  id: string;
  key: string;
  label: LTextDto;
  type: "CHOICE" | "TEXT" | "NUMBER";
  unit: string | null;
  required: boolean;
  filterable: boolean;
  variantAxis: boolean;
  displayOrder: number;
  options: OptionDto[];
}
export interface CategoryDto {
  id: string;
  slug: string;
  name: LTextDto;
  description: LTextDto;
  imageUrl: string | null;
  displayOrder: number;
  productCount: number;
  /** Empty in the list, filled in the detail. */
  attributes: AttributeDto[];
}

export interface WholesaleTierDto { minQuantity: number; unitPrice: string }
export interface PriceDto {
  currency: string;
  retailPrice: string;
  salePrice: string | null;
  minOrderQuantity: number | null;
  wholesaleEnabled: boolean;
  wholesaleTiers: WholesaleTierDto[];
}
export type AvailabilityDto = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "UNTRACKED_AVAILABLE";
export interface VariantDto {
  id: string;
  sku: string;
  axisValues: Record<string, string>;
  retailPrices: { currency: string; retailPrice: string }[];
  availability: AvailabilityDto;
  availableQuantity: number | null;
}
export interface ProductImageDto { id: string; url: string; alt: LTextDto; position: number }
export interface ProductAttributeValueDto { attributeId: string; optionId: string | null; text: string | null; number: number | string | null }
export interface ProductDto {
  id: string;
  sku: string;
  slug: string;
  categoryId: string;
  categorySlug: string;
  name: LTextDto;
  description: LTextDto;
  brand: string | null;
  sellingUnit: string;
  unitNote: LTextDto;
  prices: PriceDto[];
  variants: VariantDto[];
  images: ProductImageDto[];
  attributes: ProductAttributeValueDto[];
  availability: AvailabilityDto;
  availableQuantity: number | null;
  createdAt: string;
}

export interface PickupHoursDto { day: number; open: boolean; from: string; to: string }
export interface PickupLocationDto {
  storeName?: string; addressLine?: string; city?: string; region?: string; country?: string; postalCode?: string | null;
  phone?: string; email?: string | null; additionalLocationInfo?: LTextDto; schedule?: PickupHoursDto[]; closureInfo?: LTextDto;
}
export interface PickupInstructionsDto { general?: LTextDto; contact?: LTextDto; accepted?: LTextDto; ready?: LTextDto; policy?: LTextDto }
export interface PickupDto {
  status: "available" | "disabled" | "not_configured";
  unavailableMessage: LTextDto | null;
  location: PickupLocationDto | null;
  instructions: PickupInstructionsDto | null;
}

export type ReservationStatusDto = "PENDING_REVIEW" | "CONFIRMED" | "REJECTED" | "READY_FOR_PICKUP" | "COLLECTED" | "CANCELLED" | "EXPIRED";
export type ReservationEventTypeDto = "SUBMITTED" | "ACCEPTED" | "REJECTED" | "READY_FOR_PICKUP" | "COLLECTED" | "CANCELLED" | "EXPIRED" | "NOTE";
export interface ReservationLineDto {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  variantLabel: string | null;
  unit: string;
  quantity: number;
  currency: string;
  unitPrice: string;
  pricingKind: "RETAIL" | "SALE" | "WHOLESALE";
  tierMinQuantity: number | null;
  lineTotal: string;
}
export interface ReservationViewDto {
  id: string;
  reference: string;
  status: ReservationStatusDto;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  locale: string;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string | null;
  contact: { firstName: string; lastName: string; dialCode: string; phone: string; email: string | null };
  lines: ReservationLineDto[];
  totals: { currency: string; amount: string }[];
  balances: { currency: string; total: string; paid: string; due: string }[];
  pickup: { location: PickupLocationDto | null; instructions: PickupInstructionsDto | null; capturedAt: string; origin: string } | null;
  canCancel: boolean;
  events: { type: ReservationEventTypeDto; at: string; note: string | null; rejectReason: string | null; cancelledBy: "CUSTOMER" | "STORE" | null }[];
}

export interface MeDto { userId: string; email: string | null; emailVerified: boolean; staff: boolean; permissions: string[]; customerProfileId: string | null }
export interface ProfileDto { id: string | null; firstName: string | null; lastName: string | null; dialCode: string | null; phone: string | null; email: string | null }
