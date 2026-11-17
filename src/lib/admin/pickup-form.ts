import type { PickupSettingsDto } from "../api/admin/dto";
import type { DaySchedule, DayNumber, PickupSettings } from "../pickup/types";

/**
 * Mapping between the API's pickup configuration (`GET/PUT /admin/settings/pickup`) and the form's model. Nothing is invented: an unset field is an empty
 * string / null, a never-saved configuration has `version === null` (the PUT then creates it), and a closed day is sent without times.
 */
const text = (l: { fr?: string | null; ht?: string | null } | null | undefined) => ({ fr: l?.fr ?? "", ht: l?.ht ?? "" });
const DAYS: DayNumber[] = [1, 2, 3, 4, 5, 6, 7];

export function toSettings(dto: PickupSettingsDto): PickupSettings {
  const l = dto.location ?? {};
  const byDay = new Map((l.schedule ?? []).map((d) => [d.day, d]));
  const schedule: DaySchedule[] = DAYS.map((day) => { const d = byDay.get(day); return { day, open: d?.open ?? false, from: d?.from ?? "", to: d?.to ?? "" }; });
  const i = dto.instructions ?? {};
  return {
    enabled: dto.enabled,
    unavailableMessage: text(dto.unavailableMessage),
    location: {
      storeName: l.storeName ?? "", addressLine: l.addressLine ?? "", city: l.city ?? "", region: l.region ?? "", country: l.country ?? "HT", postalCode: l.postalCode ?? undefined,
      phone: l.phone ?? "", email: l.email ?? undefined, additionalLocationInfo: text(l.additionalLocationInfo), schedule, closureInfo: text(l.closureInfo),
    },
    instructions: { general: text(i.general), contact: text(i.contact), accepted: text(i.accepted), ready: text(i.ready), policy: text(i.policy) },
    holdPeriodDays: dto.holdPeriodDays,
    updatedAt: dto.updatedAt ?? "",
    updatedBy: dto.updatedBy ?? "",
  };
}

export function toRequest(s: PickupSettings, version: number | null): PickupSettingsDto {
  return {
    enabled: s.enabled,
    unavailableMessage: s.unavailableMessage,
    location: {
      storeName: s.location.storeName.trim(), addressLine: s.location.addressLine.trim(), city: s.location.city.trim(), region: s.location.region.trim(), country: s.location.country,
      postalCode: s.location.postalCode?.trim() || null, phone: s.location.phone.trim(), email: s.location.email?.trim() || null,
      additionalLocationInfo: s.location.additionalLocationInfo, closureInfo: s.location.closureInfo,
      schedule: s.location.schedule.map((d) => (d.open ? { day: d.day, open: true, from: d.from, to: d.to } : { day: d.day, open: false, from: "", to: "" })),
    },
    instructions: s.instructions,
    holdPeriodDays: s.holdPeriodDays,
    version, updatedAt: null, updatedBy: null,
  };
}

/** A configuration with the essentials is "configured" (display only; the server alone decides whether reservations are accepted). */
export const isConfigured = (dto: PickupSettingsDto): boolean => !!(dto.location?.storeName?.trim() && dto.location.addressLine?.trim() && dto.location.city?.trim() && dto.location.phone?.trim());
