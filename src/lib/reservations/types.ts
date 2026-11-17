/** Vocabulary of reservation statuses and events as the screens use it (lower case; the API's values are upper case, see `lib/api/map-reservation.ts`). */
export const reservationStatuses = [
  "pending_review",
  "confirmed",
  "ready_for_pickup",
  "collected",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type ReservationStatus = (typeof reservationStatuses)[number];

export type PaymentStatus = "unpaid" | "partial" | "paid";

export type RejectReason = "product_unavailable" | "incorrect_product_info" | "quantity_unavailable" | "cannot_fulfill" | "other";
export const rejectReasons: RejectReason[] = ["product_unavailable", "incorrect_product_info", "quantity_unavailable", "cannot_fulfill", "other"];

export type EventType = "submitted" | "accepted" | "rejected" | "ready_for_pickup" | "payment_recorded" | "collected" | "cancelled" | "expired" | "note_added" | "pickup_changed";
