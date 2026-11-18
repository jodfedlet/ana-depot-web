import type { LTextDto, PageDto } from "../dto";

/**
 * Wire types of the STAFF API (`/api/v1/admin/**`), mirroring the controllers' records in `ana-depot-api`. Money is a decimal string next to an explicit
 * currency; every figure is per currency (a `Record<currency, decimal>`), never a single total. Screens use these through small mappers/validators, not as UI state.
 */
export type { PageDto };
export type CurrencyMap = Record<string, string>;
export type LText = { fr?: string | null; ht?: string | null };
export type Who = { kind: string; userId: string | null };

// ---- categories ----
export interface AdminOption { id: string; code: string; label: LTextDto; displayOrder: number; active: boolean; useCount: number | null }
export interface AdminAttribute {
  id: string; key: string; label: LTextDto; type: "CHOICE" | "TEXT" | "NUMBER"; unit: string | null; required: boolean; filterable: boolean; variantAxis: boolean;
  displayOrder: number; active: boolean; valueCount: number | null; options: AdminOption[];
}
export interface AdminCategorySummary { id: string; slug: string; name: LTextDto; imageUrl: string | null; active: boolean; displayOrder: number; attributeCount: number; productCount: number; activeProductCount: number; version: number }
export interface AdminCategory {
  id: string; slug: string; name: LTextDto; description: LTextDto; imageUrl: string | null; active: boolean; displayOrder: number; version: number; createdAt: string; updatedAt: string;
  productCount: number; activeProductCount: number; attributes: AdminAttribute[];
}
export interface CategoryOptionRequest { id?: string; code: string; label: LText; displayOrder?: number; active?: boolean }
export interface CategoryAttributeRequest { id?: string; key: string; label: LText; type: string; unit?: string | null; required?: boolean; filterable?: boolean; variantAxis?: boolean; displayOrder?: number; active?: boolean; options?: CategoryOptionRequest[] }
export interface CategoryRequest { version?: number; slug: string; name: LText; description?: LText; imageUrl?: string | null; active?: boolean; displayOrder?: number; attributes: CategoryAttributeRequest[] }
export interface CategoryProductLine { id: string; sku: string; slug: string; name: LTextDto; brand: string | null; status: string; currencies: string[]; variantCount: number; imageCount: number; updatedAt: string }

// ---- products ----
export type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE";
export interface AdminTier { minQuantity: number; unitPrice: string }
export interface AdminPrice { currency: string; retail: string; sale: string | null; minOrderQuantity: number; wholesaleEnabled: boolean; tiers: AdminTier[]; active: boolean }
export interface AdminVariant { id: string; sku: string; active: boolean; position: number; axisValues: Record<string, string>; retailOverrides: Record<string, string> | null }
export interface AdminAttributeValue { attributeId: string; optionId: string | null; text: string | null; number: string | number | null }
export interface AdminImage { id: string; url: string; alt: LTextDto; position: number }
export interface StockPosition { id: string; variantId: string | null; tracked: boolean; lowStockThreshold: number | null; onHand: number; reserved: number; available: number }
export interface StockSummary { onHand: number; reserved: number; available: number; hasUntrackedPosition: boolean; state: string; positions: StockPosition[] }
export interface AdminProductSummary {
  id: string; sku: string; slug: string; categoryId: string; name: LTextDto; brand: string | null; unit: string; status: ProductStatus; prices: AdminPrice[]; variantCount: number; imageCount: number;
  primaryImageUrl: string | null; stock: StockSummary; version: number; createdAt: string; updatedAt: string;
}
export interface AdminProduct {
  id: string; sku: string; slug: string; categoryId: string; name: LTextDto; description: LTextDto; brand: string | null; unit: string; unitNote: LTextDto; status: ProductStatus; version: number;
  createdAt: string; updatedAt: string; prices: AdminPrice[]; variants: AdminVariant[]; attributes: AdminAttributeValue[]; images: AdminImage[]; stock: StockSummary;
}
export interface ProductRequest {
  version?: number; sku?: string; slug?: string; categoryId: string; name: LText; description?: LText; brand?: string | null; unit: string; unitNote?: LText; status?: ProductStatus;
  prices: { currency: string; retail: string; sale?: string | null; minOrderQuantity?: number; wholesaleEnabled?: boolean; tiers: AdminTier[]; active?: boolean }[];
  variants: { id?: string; sku: string; active?: boolean; position?: number; axisValues: Record<string, string>; retailOverrides?: Record<string, string> }[];
  attributes: { attributeId: string; optionId?: string | null; text?: string | null; number?: string | null }[];
}

// ---- inventory ----
export interface AdminPosition {
  id: string; productId: string; variantId: string | null; productSku: string; productName: LTextDto; productStatus: string; categoryId: string; variantSku: string | null; tracked: boolean;
  onHand: number | null; reserved: number | null; available: number | null; lowStockThreshold: number | null; state: "OK" | "LOW" | "OUT" | "UNTRACKED"; version: number; updatedAt: string;
}
export interface AdminMovement { id: string; inventoryItemId: string; type: string; delta: number; balanceAfter: number; reason: string; reservationId: string | null; note: string | null; at: string; recordedBy: string | null }

// ---- reservations ----
export type ReservationStatus = "PENDING_REVIEW" | "CONFIRMED" | "REJECTED" | "READY_FOR_PICKUP" | "COLLECTED" | "CANCELLED" | "EXPIRED";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";
export interface AdminContact { firstName: string; lastName: string; dialCode: string; phone: string; email: string | null }
export interface AdminBalance { currency: string; total: string; paid: string; due: string }
export interface AdminReservationSummary { id: string; reference: string; status: ReservationStatus; paymentStatus: PaymentStatus; createdAt: string; contact: AdminContact; lineCount: number; unitCount: number; balances: AdminBalance[] }
export interface AdminLine { id: string; productId: string; variantId: string | null; name: string; sku: string; variantLabel: string | null; unit: string; quantity: number; currency: string; unitPrice: string; pricingKind: string; tierMinQuantity: number | null; lineTotal: string }
export interface AdminChange { from: ReservationStatus | null; to: ReservationStatus; reasonCode: string | null; reasonNote: string | null; at: string; actor: Who }
export interface AdminNote { id: string; visibility: "INTERNAL" | "CUSTOMER_VISIBLE"; body: string; at: string; author: Who }
export type AllowedAction = "ACCEPT" | "REJECT" | "MARK_READY" | "COLLECT" | "CANCEL" | "ADD_NOTE";
export interface AdminReservation {
  id: string; reference: string; status: ReservationStatus; paymentStatus: PaymentStatus; locale: string; createdAt: string; readyAt: string | null; expiresAt: string | null; customerId: string | null;
  contact: AdminContact; lines: AdminLine[]; balances: AdminBalance[]; pickup: Record<string, unknown> | null; terms: { version: string | null; acceptedAt: string } | null;
  history: AdminChange[]; notes: AdminNote[]; allowedActions: AllowedAction[];
}

// ---- payments ----
export interface AdminPayment {
  id: string; reservationId: string; reservationReference: string; amount: string; currency: string; method: string; receivedAt: string; recordedAt: string; recordedBy: string | null;
  reference: string | null; note: string | null; reversed: boolean; reversal: { at: string; reason: string; by: string | null } | null;
}
/** One hosted-Checkout attempt (`GET /admin/payment-attempts`). It becomes a payment only after the verified provider webhook; no URL or secret is ever included. */
export type PaymentAttemptStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
export interface AdminPaymentAttempt {
  id: string; reservationId: string; reservationReference?: string | null; provider?: string; currency: string; amount: string; status: PaymentAttemptStatus;
  providerSessionId: string | null; providerPaymentIntentId: string | null; expiresAt: string | null; paymentId: string | null;
  requiresAttention: boolean; attentionReason: string | null; failureCode: string | null; createdAt: string; updatedAt: string;
}
export interface PaymentOutcome { payment: AdminPayment; paymentStatus: PaymentStatus; balances: AdminBalance[] }
export interface ReservationPayments { paymentStatus: PaymentStatus; balances: AdminBalance[]; payments: AdminPayment[] }
export interface LedgerEntry { id: string; type: "PAYMENT_RECEIVED" | "PAYMENT_REVERSAL" | "ADJUSTMENT"; amount: string; currency: string; paymentId: string | null; reversesEntryId: string | null; reason: string | null; at: string; createdBy: string | null; correlationId: string | null }
export interface Reconciliation { reservationId: string; consistent: boolean; lines: { currency: string; cachedPaid: string; ledgerPaid: string; consistent: boolean }[] }

// ---- customers ----
export interface AdminCustomer {
  id: string; kind: "REGISTERED" | "GUEST"; firstName: string; lastName: string; dialCode: string; phone: string; email: string | null; hasAccount: boolean; createdAt: string; updatedAt: string; version: number;
  activity: { reservations: number; firstReservationAt: string | null; lastReservationAt: string | null };
  summary: { reservationsByStatus: Record<string, number>; collectedByCurrency: CurrencyMap; openDueByCurrency: CurrencyMap } | null;
}

// ---- reports ----
export interface ReportPeriod { from: string; to: string; timezone: string }
export interface StockCounts { ok: number; low: number; out: number; untracked: number; activeProductsWithoutStockRecord: number }
export interface OverviewReport { period: ReportPeriod; reservationsCreated: Record<string, number>; openNow: Record<string, number>; collected: CurrencyMap; paymentsNet: CurrencyMap; stock: StockCounts; activeProducts: number; newCustomers: number }
export interface SalesReport { period: ReportPeriod; groupBy: string; buckets: { start: string; collected: CurrencyMap; reservations: number }[]; totals: CurrencyMap; reservations: number }
export interface PaymentBucket { start?: string; received: CurrencyMap; reversed: CurrencyMap; adjustments: CurrencyMap; net: CurrencyMap }
/** `receivedByMethod`: money received in the period by how it was paid ("CASH_AT_PICKUP", "STRIPE_CHECKOUT"), per currency. */
export interface PaymentsReport { period: ReportPeriod; groupBy: string; buckets: PaymentBucket[]; totals: PaymentBucket; receivedByMethod?: Record<string, Record<string, string>> }
export interface ProductsReport { period: ReportPeriod; rows: { productId: string; name: string; sku: string; currency: string; quantity: number; revenue: string; reservations: number }[] }
export interface ReservationsReport { period: ReportPeriod; byStatus: Record<string, number>; total: number; rejectionReasons: Record<string, number> }
export interface StockReport { stock: StockCounts; activeProducts: number }

// ---- team ----
export interface StaffMemberDto { userId: string; active: boolean; you: boolean; initial?: boolean; displayName: string | null; email: string | null; note: string | null; joinedAt: string; updatedAt: string | null }
export type InvitationStatusDto = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
export interface StaffInvitationDto { id: string; note: string; status: InvitationStatusDto; createdAt: string; expiresAt: string }
/** The one answer that carries the invitation code. It is never returned again. */
export interface IssuedInvitationDto { id: string; note: string; expiresAt: string; code: string }

// ---- settings ----
export interface PickupScheduleDay { day: number; open: boolean; from: string; to: string }
export interface PickupSettingsDto {
  enabled: boolean; unavailableMessage: LTextDto | null;
  location: { storeName?: string; addressLine?: string; city?: string; region?: string; country?: string; postalCode?: string | null; phone?: string; email?: string | null; additionalLocationInfo?: LTextDto; schedule?: PickupScheduleDay[]; closureInfo?: LTextDto } | null;
  instructions: { general?: LTextDto; contact?: LTextDto; accepted?: LTextDto; ready?: LTextDto; policy?: LTextDto } | null;
  holdPeriodDays: number | null; version: number | null; updatedAt: string | null; updatedBy: string | null;
}

// ---- uploads ----
export interface UploadTicket { uploadId: string; productId: string; contentType: string; maxBytes: number; upload: { url: string; method: string; headers: Record<string, string>; expiresAt: string } }
