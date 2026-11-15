import { describe, expect, it } from "vitest";
import { sampleReservations } from "../mock/reservations";
import { canView, generateReference, normalizeReference, phoneMatches } from "./access";

const r = sampleReservations.find((x) => x.reference === "ANA-PEND01")!; // +509 0000 0101, alex.sample@example.com

describe("reservation access", () => {
  it("verifies by phone number with or without the country code, rejecting short/wrong input", () => {
    expect(phoneMatches(r, "0000 0101")).toBe(true);
    expect(phoneMatches(r, "+509 0000 0101")).toBe(true);
    expect(phoneMatches(r, "5090000 0101")).toBe(true);
    expect(phoneMatches(r, "0000 0102")).toBe(false);
    expect(phoneMatches(r, "123")).toBe(false);
    expect(phoneMatches(r, "")).toBe(false);
  });
  it("only lets verified guests or the owning account view a reservation", () => {
    expect(canView(r, { verifiedReferences: [] })).toBe(false);
    expect(canView(r, { verifiedReferences: ["ANA-OTHER1"] })).toBe(false);
    expect(canView(r, { verifiedReferences: ["ANA-PEND01"] })).toBe(true);
    expect(canView(r, { sessionEmail: "ALEX.sample@example.com", verifiedReferences: [] })).toBe(true);
    expect(canView(r, { sessionEmail: "someone@else.com", verifiedReferences: [] })).toBe(false);
  });
  it("generates readable, unambiguous references", () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateReference()));
    expect(refs.size).toBeGreaterThan(490);
    for (const ref of refs) expect(ref).toMatch(/^ANA-[A-HJKMNP-Z2-9]{6}$/);
    expect(normalizeReference(" ana-pend01 ")).toBe("ANA-PEND01");
  });
});
