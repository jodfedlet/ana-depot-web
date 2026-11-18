import { describe, expect, it } from "vitest";
import { UNKNOWN_CAPABILITIES, toCapabilities } from "./capabilities";

const both = { online: { provider: "STRIPE", currencies: ["USD"] }, onlineStatus: "AVAILABLE", atPickup: { available: true }, summary: "BOTH" };

describe("toCapabilities: what the customer may be told, decided by the backend's answer", () => {
  it("Stripe available and pay-at-pickup open -> both, with the currencies the account really covers", () => {
    expect(toCapabilities(both)).toEqual({ mode: "both", online: "available", currencies: ["USD"], pickupOpen: true });
  });
  it("Stripe disabled -> pay at pickup only, nothing online is advertised", () => {
    expect(toCapabilities({ online: null, onlineStatus: "DISABLED", atPickup: { available: true }, summary: "PICKUP_ONLY" })).toEqual({ mode: "pickup", online: "disabled", currencies: [], pickupOpen: true });
  });
  it("Stripe temporarily unavailable -> pay at pickup only, and the state is kept so the page can say so", () => {
    const c = toCapabilities({ online: null, onlineStatus: "TEMPORARILY_UNAVAILABLE", atPickup: { available: true }, summary: "PICKUP_ONLY" });
    expect(c).toMatchObject({ mode: "pickup", online: "temporarily_unavailable", currencies: [] });
  });
  it("no payment method available (reservations closed) -> closed, whatever Stripe says", () => {
    expect(toCapabilities({ ...both, atPickup: { available: false }, summary: "NONE" }).mode).toBe("closed");
  });
  it("never claims a card because a status says available while no currency is covered", () => {
    expect(toCapabilities({ online: { currencies: [] }, onlineStatus: "AVAILABLE", atPickup: { available: true }, summary: "PICKUP_ONLY" })).toMatchObject({ mode: "pickup", currencies: [] });
  });
  it("an unknown, failed or not-yet-loaded answer falls back to the wording that is true in every case", () => {
    expect(toCapabilities(undefined)).toEqual(UNKNOWN_CAPABILITIES);
    expect(toCapabilities(null).mode).toBe("pickup");
    expect(toCapabilities({ onlineStatus: "SOMETHING_NEW" }).online).toBe("unknown");
  });
  it("an older API without the new fields: the presence of the online option is its only signal", () => {
    expect(toCapabilities({ online: { provider: "STRIPE", currencies: ["USD", "HTG"] } })).toMatchObject({ mode: "both", online: "available", currencies: ["USD", "HTG"] });
    expect(toCapabilities({ online: null })).toMatchObject({ mode: "pickup", online: "disabled" });
  });
});
