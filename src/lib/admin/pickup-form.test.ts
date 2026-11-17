import { describe, expect, it } from "vitest";
import type { PickupSettingsDto } from "../api/admin/dto";
import { isConfigured, toRequest, toSettings } from "./pickup-form";

const never: PickupSettingsDto = { enabled: false, unavailableMessage: null, location: null, instructions: null, holdPeriodDays: null, version: null, updatedAt: null, updatedBy: null };

describe("pickup settings mapping (MOCKED shapes)", () => {
  it("a never-saved configuration maps to empty fields and seven closed days — nothing invented", () => {
    const s = toSettings(never);
    expect(s.location.storeName).toBe("");
    expect(s.location.schedule).toHaveLength(7);
    expect(s.location.schedule.every((d) => !d.open)).toBe(true);
    expect(s.holdPeriodDays).toBeNull();
    expect(isConfigured(never)).toBe(false);
  });
  it("a closed day is sent without times; the version is echoed (null for the first save)", () => {
    const s = toSettings(never);
    s.location.schedule[0] = { day: 1, open: true, from: "09:00", to: "17:00" };
    const req = toRequest(s, null);
    expect(req.version).toBeNull();
    expect(req.location?.schedule?.[0]).toEqual({ day: 1, open: true, from: "09:00", to: "17:00" });
    expect(req.location?.schedule?.[1]).toEqual({ day: 2, open: false, from: "", to: "" });
    expect(toRequest(s, 4).version).toBe(4);
  });
  it("a saved configuration round-trips, keeping the hold period the owner set", () => {
    const dto: PickupSettingsDto = { ...never, enabled: true, holdPeriodDays: 3, version: 2, location: { storeName: "S", addressLine: "A", city: "C", region: "R", country: "HT", phone: "+509 1", schedule: [{ day: 3, open: true, from: "08:00", to: "12:00" }] }, instructions: { ready: { fr: "Prêt", ht: "" } } };
    const s = toSettings(dto);
    expect(s.location.schedule.find((d) => d.day === 3)).toMatchObject({ open: true, from: "08:00" });
    const req = toRequest(s, 2);
    expect(req.holdPeriodDays).toBe(3);
    expect(req.instructions?.ready?.fr).toBe("Prêt");
    expect(isConfigured(dto)).toBe(true);
  });
});
