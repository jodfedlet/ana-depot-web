import { describe, expect, it } from "vitest";
import { hasPayments, isOverpaid, isSettled } from "./money";

describe("balance display helpers (per currency, never summed)", () => {
  it("detects over-payment inside ONE currency; the other currency is irrelevant", () => {
    expect(isOverpaid({ currency: "HTG", total: "2800.00", paid: "3000.00", due: "0.00" })).toBe(true);
    expect(isOverpaid({ currency: "USD", total: "21.00", paid: "21.00", due: "0.00" })).toBe(false);
  });
  it("settled means the server's due amount is zero", () => {
    expect(isSettled({ currency: "HTG", total: "10.00", paid: "10.00", due: "0.00" })).toBe(true);
    expect(isSettled({ currency: "HTG", total: "10.00", paid: "4.00", due: "6.00" })).toBe(false);
  });
  it("any paid amount in any currency counts as 'has payments'", () => {
    expect(hasPayments([{ currency: "HTG", total: "1.00", paid: "0.00", due: "1.00" }, { currency: "USD", total: "1.00", paid: "0.50", due: "0.50" }])).toBe(true);
    expect(hasPayments([{ currency: "HTG", total: "1.00", paid: "0.00", due: "1.00" }])).toBe(false);
  });
});
