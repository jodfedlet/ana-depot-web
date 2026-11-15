import { isBlank, isValidEmail, isValidPhone } from "../validation";
import type { PickupSettings } from "./types";

export type PickupErrorKey =
  | "storeName" | "addressLine" | "city" | "region" | "country" | "phone" | "email"
  | "schedule" | "scheduleHours" | "holdPeriodDays" | "instructionsGeneral";
export type PickupErrors = Partial<Record<PickupErrorKey, string>>;

/** Returns message KEYS (validation.*) so forms can translate them. Server-side validation stays authoritative. */
export function validatePickupSettings(s: PickupSettings): PickupErrors {
  const e: PickupErrors = {};
  const l = s.location;
  // While pickup is enabled the essentials must exist, otherwise customers would reserve with nowhere to go.
  if (s.enabled) {
    if (isBlank(l.storeName)) e.storeName = "validation.required";
    if (isBlank(l.addressLine)) e.addressLine = "validation.required";
    if (isBlank(l.city)) e.city = "validation.required";
    if (isBlank(l.region)) e.region = "validation.required";
    if (isBlank(l.country)) e.country = "validation.required";
    if (isBlank(l.phone)) e.phone = "validation.required";
    if (!l.schedule.some((d) => d.open)) e.schedule = "validation.scheduleOneDay";
  }
  if (!isBlank(l.phone) && !isValidPhone(l.phone)) e.phone = "validation.phone";
  if (!isBlank(l.email) && !isValidEmail(l.email ?? "")) e.email = "validation.email";
  if (l.schedule.some((d) => d.open && d.from >= d.to)) e.scheduleHours = "validation.scheduleHours";
  if (s.holdPeriodDays !== null && (!Number.isInteger(s.holdPeriodDays) || s.holdPeriodDays < 1)) e.holdPeriodDays = "validation.holdPeriod";
  return e;
}

/** Which groups of settings differ — shown in the change confirmation and history. */
export function changedGroups(a: PickupSettings, b: PickupSettings): string[] {
  const out: string[] = [];
  const j = JSON.stringify;
  if (a.enabled !== b.enabled) out.push("enabled");
  if (j(a.unavailableMessage) !== j(b.unavailableMessage)) out.push("unavailableMessage");
  const la = a.location, lb = b.location;
  if (la.storeName !== lb.storeName || la.addressLine !== lb.addressLine || la.city !== lb.city || la.region !== lb.region ||
    la.country !== lb.country || (la.postalCode ?? "") !== (lb.postalCode ?? "") || j(la.additionalLocationInfo) !== j(lb.additionalLocationInfo)) out.push("address");
  if (la.phone !== lb.phone || (la.email ?? "") !== (lb.email ?? "")) out.push("contact");
  if (j(la.schedule) !== j(lb.schedule) || j(la.closureInfo) !== j(lb.closureInfo)) out.push("schedule");
  if (j(a.instructions) !== j(b.instructions)) out.push("instructions");
  if (a.holdPeriodDays !== b.holdPeriodDays) out.push("holdPeriod");
  return out;
}
