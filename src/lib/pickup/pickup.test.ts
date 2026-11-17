import { describe, expect, it } from "vitest";
import type { PickupSettingsDto } from "../api/admin/dto";
import { toSettings } from "../admin/pickup-form";
import { pickupAvailability, sameAddress } from "./types";
import { changedGroups, validatePickupSettings } from "./validate";

/** A complete configuration shaped like the API's (MOCKED data: validation rules only, nothing about the real store). */
const dto: PickupSettingsDto = {
  enabled: true, unavailableMessage: { fr: "", ht: "" }, holdPeriodDays: null, version: 1, updatedAt: null, updatedBy: null,
  location: { storeName: "Test store", addressLine: "1 test street", city: "Test city", region: "R", country: "HT", phone: "+509 0000 0000", email: "t@example.test",
    schedule: [1, 2, 3, 4, 5].map((day) => ({ day, open: true, from: "09:00", to: "17:00" })), additionalLocationInfo: { fr: "", ht: "" }, closureInfo: { fr: "", ht: "" } },
  instructions: { general: { fr: "x", ht: "x" }, contact: { fr: "", ht: "" }, accepted: { fr: "", ht: "" }, ready: { fr: "", ht: "" }, policy: { fr: "", ht: "" } },
};
const clone = () => toSettings(dto);

describe("pickup availability", () => {
  it("is available only when enabled and essentials are present", () => {
    expect(pickupAvailability(clone())).toBe("available");
    expect(pickupAvailability({ ...clone(), enabled: false })).toBe("disabled");
    const s = clone();
    s.location.addressLine = "";
    expect(pickupAvailability(s)).toBe("not_configured");
  });
});

describe("pickup validation", () => {
  it("accepts a complete configuration", () => {
    expect(validatePickupSettings(clone())).toEqual({});
  });
  it("requires essentials while enabled but not while disabled", () => {
    const s = clone();
    s.location.city = "";
    s.location.schedule = s.location.schedule.map((d) => ({ ...d, open: false }));
    const errors = validatePickupSettings(s);
    expect(errors.city).toBe("validation.required");
    expect(errors.schedule).toBe("validation.scheduleOneDay");
    expect(validatePickupSettings({ ...s, enabled: false }).city).toBeUndefined();
  });
  it("validates hours, phone, email and hold period", () => {
    const s = clone();
    s.location.schedule[0] = { day: 1, open: true, from: "17:00", to: "09:00" };
    s.location.phone = "abc";
    s.location.email = "not-an-email";
    s.holdPeriodDays = 0;
    const e = validatePickupSettings(s);
    expect(e.scheduleHours).toBeDefined();
    expect(e.phone).toBe("validation.phone");
    expect(e.email).toBe("validation.email");
    expect(e.holdPeriodDays).toBe("validation.holdPeriod");
  });
});

describe("change detection", () => {
  it("reports which groups changed", () => {
    const a = clone();
    const b = clone();
    expect(changedGroups(a, b)).toEqual([]);
    b.location.addressLine = "Autre";
    b.enabled = false;
    b.holdPeriodDays = 5;
    expect(changedGroups(a, b)).toEqual(expect.arrayContaining(["enabled", "address", "holdPeriod"]));
    expect(sameAddress(a.location, b.location)).toBe(false);
  });
});
