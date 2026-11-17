import { describe, expect, it } from "vitest";
import { decimalToMinor } from "./decimal";

describe("decimalToMinor (API decimal strings -> integer minor units, no floating point)", () => {
  it("converts exactly, in either currency", () => {
    expect(decimalToMinor("25000.00", "HTG")).toBe(2500000);
    expect(decimalToMinor("180.5", "USD")).toBe(18050);
    expect(decimalToMinor("0.10", "USD")).toBe(10);
    expect(decimalToMinor("1.005", "USD")).toBeNull(); // a sub-cent amount is refused, not silently rounded
    expect(decimalToMinor("19.99", "USD")).toBe(1999); // the classic 19.99 * 100 = 1998.9999… case
    expect(decimalToMinor("3", "HTG")).toBe(300);
    expect(decimalToMinor("25.500", "USD")).toBe(2550); // harmless trailing zeros
  });
  it("refuses anything that is not a plain non-negative decimal", () => {
    for (const bad of ["", " ", "abc", "-5.00", "1e3", "1,5", "12.", ".5", "NaN", "Infinity", "1 000.00", null, undefined]) expect(decimalToMinor(bad as string, "HTG")).toBeNull();
  });
});
