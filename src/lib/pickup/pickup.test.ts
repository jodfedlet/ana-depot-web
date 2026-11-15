import { describe, expect, it } from "vitest";
import { samplePickupSettings } from "../mock/pickup";
import { pickupAvailability, sameAddress } from "./types";
import { changedGroups, validatePickupSettings } from "./validate";

const clone = () => structuredClone(samplePickupSettings);

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
  it("accepts the sample configuration", () => {
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
