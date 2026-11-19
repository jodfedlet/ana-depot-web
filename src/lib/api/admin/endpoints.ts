import { adminApi as api } from "./client";
import { refreshesStorefront } from "./storefront-refresh";
import type {
  AdminCategory, AdminCategorySummary, AdminCustomer, AdminMovement, AdminPayment, AdminPaymentAttempt, AdminPosition, AdminProduct, AdminProductSummary, AdminReservation, AdminReservationSummary,
  CategoryProductLine, CategoryRequest, LedgerEntry, OverviewReport, PageDto, PaymentOutcome, PaymentsReport, PickupSettingsDto, ProductRequest, ProductsReport, Reconciliation,
  ReservationPayments, ReservationsReport, SalesReport, StockReport, UploadTicket, AdminImage, StaffMemberDto, StaffInvitationDto, IssuedInvitationDto, NotificationDto, NotificationSummaryDto,
} from "./dto";

/** One function per staff endpoint of `ana-depot-api/docs/api.md` ("Staff admin API"). Nothing here is invented; every call is authorized by the backend. */
type Opts = { signal?: AbortSignal };
type W = Opts & { idempotencyKey?: string };
type Q = Record<string, string | number | boolean | undefined>;

// ---- reports ----
export const reportOverview = (q: Q, o?: Opts) => api.get<OverviewReport>("/reports/overview", q, o);
export const reportSales = (q: Q, o?: Opts) => api.get<SalesReport>("/reports/sales", q, o);
export const reportPayments = (q: Q, o?: Opts) => api.get<PaymentsReport>("/reports/payments", q, o);
export const reportProducts = (q: Q, o?: Opts) => api.get<ProductsReport>("/reports/products", q, o);
export const reportReservations = (q: Q, o?: Opts) => api.get<ReservationsReport>("/reports/reservations", q, o);
export const reportStock = (o?: Opts) => api.get<StockReport>("/reports/stock", undefined, o);

// ---- customer e-mail notifications ----
export const listNotifications = (q: Q, o?: Opts) => api.get<PageDto<NotificationDto>>("/notifications", q, o);
export const notificationSummary = (o?: Opts) => api.get<NotificationSummaryDto>("/notifications/summary", undefined, o);
export const retryNotification = (id: string, o?: W) => api.post<NotificationDto>(`/notifications/${id}/retry`, undefined, o);

// ---- team ----
export const listStaff = (o?: Opts) => api.get<StaffMemberDto[]>("/staff", undefined, o);
export const setStaffActive = (userId: string, active: boolean, o?: W) => api.put<StaffMemberDto>(`/staff/${userId}`, { active }, o);
export const listInvitations = (o?: Opts) => api.get<StaffInvitationDto[]>("/staff/invitations", undefined, o);
export const createInvitation = (note: string, o?: W) => api.post<IssuedInvitationDto>("/staff/invitations", { note }, o);
export const revokeInvitation = (id: string, o?: W) => api.delete(`/staff/invitations/${id}`, o);

// ---- categories ----
export const listCategories = (q: Q, o?: Opts) => api.get<PageDto<AdminCategorySummary>>("/categories", q, o);
export const getCategory = (id: string, o?: Opts) => api.get<AdminCategory>(`/categories/${id}`, undefined, o);
export const createCategory = (body: CategoryRequest, o?: W) => refreshesStorefront(api.post<AdminCategory>("/categories", body, o));
export const updateCategory = (id: string, body: CategoryRequest, o?: W) => refreshesStorefront(api.put<AdminCategory>(`/categories/${id}`, body, o));
export const setCategoryActive = (id: string, active: boolean, reason?: string, o?: W) => refreshesStorefront(api.patch<AdminCategory>(`/categories/${id}/active`, { active, reason }, o));
export const reorderCategories = (categoryIds: string[], o?: W) => refreshesStorefront(api.put<{ items: AdminCategorySummary[] }>("/categories/order", { categoryIds }, o));
export const listCategoryProducts = (id: string, q: Q, o?: Opts) => api.get<PageDto<CategoryProductLine>>(`/categories/${id}/products`, q, o);
export const moveCategoryProducts = (id: string, toCategoryId: string, productIds: string[], o?: W) => refreshesStorefront(api.post<{ moved: number }>(`/categories/${id}/products/move`, { toCategoryId, productIds }, o));

/** Every category (few of them): pages are followed until the server says there are no more. */
export async function listAllCategories(signal?: AbortSignal): Promise<AdminCategorySummary[]> {
  const all: AdminCategorySummary[] = [];
  for (let page = 0; ; page++) {
    const res = await listCategories({ page, size: 100 }, { signal });
    all.push(...res.items);
    if (page + 1 >= res.totalPages) return all;
  }
}

// ---- products ----
export const listProducts = (q: Q, o?: Opts) => api.get<PageDto<AdminProductSummary>>("/products", q, o);
export const getProduct = (id: string, o?: Opts) => api.get<AdminProduct>(`/products/${id}`, undefined, o);
export const createProduct = (body: ProductRequest, o?: W) => refreshesStorefront(api.post<AdminProduct>("/products", body, o));
export const updateProduct = (id: string, body: ProductRequest, o?: W) => refreshesStorefront(api.put<AdminProduct>(`/products/${id}`, body, o));
export const setProductStatus = (id: string, status: "ACTIVE" | "INACTIVE", reason?: string, o?: W) => refreshesStorefront(api.patch<AdminProduct>(`/products/${id}/status`, { status, reason }, o));
export const deleteProduct = (id: string, o?: W) => refreshesStorefront(api.delete(`/products/${id}`, o));
export const requestImageUpload = (productId: string, contentType: string, sizeBytes: number, o?: W) => api.post<UploadTicket>(`/products/${productId}/images/uploads`, { contentType, sizeBytes }, o);
export const completeImageUpload = (productId: string, uploadId: string, o?: W) => refreshesStorefront(api.post<AdminImage>(`/products/${productId}/images/uploads/${uploadId}/complete`, undefined, o));
export const listImages = (productId: string, o?: Opts) => api.get<{ items: AdminImage[] }>(`/products/${productId}/images`, undefined, o);
export const orderImages = (productId: string, imageIds: string[], o?: W) => refreshesStorefront(api.put<{ items: AdminImage[] }>(`/products/${productId}/images/order`, { imageIds }, o));
export const deleteImage = (productId: string, imageId: string, o?: W) => refreshesStorefront(api.delete(`/products/${productId}/images/${imageId}`, o));

// ---- inventory ----
export const listInventory = (q: Q, o?: Opts) => api.get<PageDto<AdminPosition>>("/inventory", q, o);
export const getInventory = (id: string, o?: Opts) => api.get<AdminPosition>(`/inventory/${id}`, undefined, o);
export const registerInventory = (body: { productId: string; variantId?: string | null; tracked: boolean; initialOnHand?: number; lowStockThreshold?: number | null }, o?: W) => refreshesStorefront(api.post<AdminPosition>("/inventory", body, o));
export const adjustInventory = (id: string, body: { type: "ADD" | "REDUCE" | "RECOUNT"; quantity: number; reason: string; note?: string }, o: W & { idempotencyKey: string }) => refreshesStorefront(api.post<AdminMovement>(`/inventory/${id}/adjustments`, body, o));
export const setInventoryThreshold = (id: string, version: number, lowStockThreshold: number | null, o?: W) => refreshesStorefront(api.patch<AdminPosition>(`/inventory/${id}/threshold`, { version, lowStockThreshold }, o));
export const listMovements = (id: string, q: Q, o?: Opts) => api.get<PageDto<AdminMovement>>(`/inventory/${id}/movements`, q, o);

// ---- reservations ----
export const listReservations = (q: Q, o?: Opts) => api.get<PageDto<AdminReservationSummary>>("/reservations", q, o);
export const getReservation = (id: string, o?: Opts) => api.get<AdminReservation>(`/reservations/${id}`, undefined, o);
export const acceptReservation = (id: string, o?: W) => refreshesStorefront(api.post<AdminReservation>(`/reservations/${id}/accept`, undefined, o));
export const rejectReservation = (id: string, reason: string, note: string | undefined, o?: W) => refreshesStorefront(api.post<AdminReservation>(`/reservations/${id}/reject`, { reason, note }, o));
export const readyReservation = (id: string, o?: W) => refreshesStorefront(api.post<AdminReservation>(`/reservations/${id}/ready`, {}, o));
export const collectReservation = (id: string, o?: W) => refreshesStorefront(api.post<AdminReservation>(`/reservations/${id}/collect`, undefined, o));
export const cancelReservation = (id: string, reason: string, o?: W) => refreshesStorefront(api.post<AdminReservation>(`/reservations/${id}/cancel`, { reason }, o));
export const addReservationNote = (id: string, visibility: "INTERNAL" | "CUSTOMER_VISIBLE", body: string, o?: W) => api.post<AdminReservation>(`/reservations/${id}/notes`, { visibility, body }, o);

// ---- payments ----
export const listPayments = (q: Q, o?: Opts) => api.get<PageDto<AdminPayment>>("/payments", q, o);
export const listPaymentAttempts = (q: Q, o?: Opts) => api.get<PageDto<AdminPaymentAttempt>>("/payment-attempts", q, o);
export const getReservationPayments = (id: string, o?: Opts) => api.get<ReservationPayments>(`/reservations/${id}/payments`, undefined, o);
export const getLedger = (id: string, o?: Opts) => api.get<LedgerEntry[]>(`/reservations/${id}/ledger`, undefined, o);
export const getReconciliation = (id: string, o?: Opts) => api.get<Reconciliation>(`/reservations/${id}/reconciliation`, undefined, o);
export const recordPayment = (id: string, body: { amount: string; currency: string; method?: string; receivedAt?: string; reference?: string; note?: string }, o: W & { idempotencyKey: string }) => api.post<PaymentOutcome>(`/reservations/${id}/payments`, body, o);
export const reversePayment = (paymentId: string, reason: string, o: W & { idempotencyKey: string }) => api.post<PaymentOutcome>(`/payments/${paymentId}/reversal`, { reason }, o);
export const adjustPayments = (id: string, body: { amount: string; currency: string; reason: string }, o: W & { idempotencyKey: string }) => api.post<LedgerEntry>(`/reservations/${id}/payment-adjustments`, body, o);

// ---- customers ----
export const listCustomers = (q: Q, o?: Opts) => api.get<PageDto<AdminCustomer>>("/customers", q, o);
export const getCustomer = (id: string, o?: Opts) => api.get<AdminCustomer>(`/customers/${id}`, undefined, o);
export const updateCustomer = (id: string, body: { version: number; firstName: string; lastName: string; email?: string }, o?: W) => api.put<AdminCustomer>(`/customers/${id}`, body, o);

// ---- settings ----
export const getPickupSettings = (o?: Opts) => api.get<PickupSettingsDto>("/settings/pickup", undefined, o);
export const savePickupSettings = (body: PickupSettingsDto, o?: W) => api.put<PickupSettingsDto>("/settings/pickup", body, o);
