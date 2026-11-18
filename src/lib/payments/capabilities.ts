/**
 * What payment options the customer may be told about. The BACKEND decides (`GET /api/v1/store/payment-options`); nothing here reads a build-time flag or infers anything from the
 * presence of checkout code. Every doubt resolves to the wording that is true whatever the provider does ("pay at pickup"): a card is advertised only when the backend says it is available.
 */
export type OnlineStatus = "available" | "disabled" | "temporarily_unavailable" | "unknown";
/** `both`: card online AND pay at pickup. `pickup`: pay at pickup only (card off, unreachable, unknown or not yet loaded). `closed`: reservations are closed, so nothing can be paid. */
export type PayMode = "both" | "pickup" | "closed";

export interface PaymentOptionsInput {
  online?: { provider?: string; currencies?: string[] } | null;
  onlineStatus?: string;
  atPickup?: { available?: boolean };
  summary?: string;
}

export interface PaymentCapabilities {
  mode: PayMode;
  online: OnlineStatus;
  /** Currencies the card option really covers (never a guess). */
  currencies: string[];
  /** Null until the backend has answered. */
  pickupOpen: boolean | null;
}

export const UNKNOWN_CAPABILITIES: PaymentCapabilities = { mode: "pickup", online: "unknown", currencies: [], pickupOpen: null };

const ONLINE: Record<string, OnlineStatus> = { AVAILABLE: "available", DISABLED: "disabled", TEMPORARILY_UNAVAILABLE: "temporarily_unavailable" };

export function toCapabilities(dto: PaymentOptionsInput | null | undefined): PaymentCapabilities {
  if (!dto) return UNKNOWN_CAPABILITIES;
  const currencies = dto.online?.currencies ?? [];
  // an older API that does not send `onlineStatus`: the presence of `online` is its only signal
  const online: OnlineStatus = dto.onlineStatus !== undefined ? (ONLINE[dto.onlineStatus] ?? "unknown") : currencies.length > 0 ? "available" : "disabled";
  const pickupOpen = dto.atPickup?.available ?? (dto.summary === undefined ? null : dto.summary !== "NONE");
  const cardOffered = online === "available" && currencies.length > 0;
  const mode: PayMode = pickupOpen === false || dto.summary === "NONE" ? "closed" : cardOffered ? "both" : "pickup";
  return { mode, online, currencies: cardOffered ? currencies : [], pickupOpen };
}
