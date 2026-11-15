import type { LText } from "../localized";

/** 1 = Monday … 7 = Sunday */
export type DayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface DaySchedule {
  day: DayNumber;
  open: boolean;
  /** "HH:MM" 24h */
  from: string;
  to: string;
}

/** Where customers collect. Used both for the global default and for per-reservation snapshots. */
export interface PickupLocation {
  storeName: string;
  addressLine: string;
  city: string;
  region: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  postalCode?: string;
  phone: string;
  email?: string;
  additionalLocationInfo: LText;
  schedule: DaySchedule[];
  closureInfo: LText;
}

export interface PickupInstructions {
  /** General instructions shown while reserving and on every reservation. */
  general: LText;
  contact: LText;
  /** Shown once the store has accepted the reservation. */
  accepted: LText;
  /** Shown when the reservation is ready for pickup. */
  ready: LText;
  policy: LText;
}

/** The global default configuration, edited by the administrator. */
export interface PickupSettings {
  enabled: boolean;
  unavailableMessage: LText;
  location: PickupLocation;
  instructions: PickupInstructions;
  /** Days a ready reservation is held before it may expire. null = no expiration policy configured. */
  holdPeriodDays: number | null;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Copy of the location + instructions as communicated to a customer. Reservations keep their
 * snapshot forever: changing the global settings never rewrites it.
 */
export interface PickupSnapshot {
  location: PickupLocation;
  instructions: PickupInstructions;
  capturedAt: string;
  /** "default" = copied from global settings; "override" = changed for this reservation by staff. */
  origin: "default" | "override";
}

export interface PickupChange {
  id: string;
  at: string;
  by: string;
  before: PickupSettings;
  after: PickupSettings;
  /** Field group names that changed (e.g. "address", "schedule", "enabled"). */
  changed: string[];
}

export function snapshotFromSettings(settings: PickupSettings, now: string): PickupSnapshot {
  return {
    location: structuredClone(settings.location),
    instructions: structuredClone(settings.instructions),
    capturedAt: now,
    origin: "default",
  };
}

/** Pickup can accept new reservations only when enabled AND the business has completed the essentials. */
export type PickupAvailability = "available" | "disabled" | "not_configured";
export function pickupAvailability(s: PickupSettings): PickupAvailability {
  if (!s.enabled) return "disabled";
  const l = s.location;
  if (!l.storeName.trim() || !l.addressLine.trim() || !l.city.trim() || !l.phone.trim()) return "not_configured";
  return "available";
}

export const sameAddress = (a: PickupLocation, b: PickupLocation) =>
  a.storeName === b.storeName && a.addressLine === b.addressLine && a.city === b.city && a.region === b.region &&
  a.country === b.country && (a.postalCode ?? "") === (b.postalCode ?? "");
