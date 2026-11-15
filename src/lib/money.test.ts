import { describe, expect, it } from "vitest";
import { SUPPORTED_CURRENCIES, addMoney, amountIn, discountPercent, formatMoney, isSupportedCurrency, majorToMinor, minorToMajor, money, multiplyMoney, sumByCurrency } from "./money";

describe("money", () => {
  it("formats minor units using the locale", () => {
    // the ISO code is always shown (never a bare symbol) so HTG and USD can never be confused
    expect(formatMoney(money(3400, "USD"), "en-US").replace(/\s/g, " ")).toBe("USD 34.00");
    expect(formatMoney(money(3400, "USD"), "de-DE").replace(/\s/g, " ")).toBe("34,00 USD");
  });
  it("respects currencies with no minor unit", () => {
    expect(formatMoney(money(1500, "JPY"), "ja-JP")).toContain("1,500");
    expect(majorToMinor(1500, "JPY")).toBe(1500);
    expect(majorToMinor(12.5, "USD")).toBe(1250);
  });
  it("refuses to add different currencies (no invented rates)", () => {
    expect(() => addMoney(money(100, "USD"), money(100, "EUR"))).toThrow();
    expect(addMoney(money(100, "USD"), money(250, "USD")).amount).toBe(350);
  });
  it("multiplies and rounds", () => {
    expect(multiplyMoney(money(333, "USD"), 3).amount).toBe(999);
  });
  it("computes discount percent only for real reductions", () => {
    expect(discountPercent(money(7900, "USD"), money(9800, "USD"))).toBe(19);
    expect(discountPercent(money(100, "USD"))).toBe(0);
    expect(discountPercent(money(100, "USD"), money(100, "USD"))).toBe(0);
    expect(discountPercent(money(100, "USD"), money(200, "EUR"))).toBe(0);
  });

  it("supports exactly HTG and USD at launch, and formats both with their ISO code in fr and ht", () => {
    expect([...SUPPORTED_CURRENCIES]).toEqual(["HTG", "USD"]);
    expect(isSupportedCurrency("HTG") && isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("EUR")).toBe(false);
    const norm = (x: string) => x.replace(/[\u00a0\u202f]/g, " ");
    expect(norm(formatMoney(money(180000, "HTG"), "fr"))).toBe("1 800,00 HTG");
    expect(norm(formatMoney(money(180000, "HTG"), "ht"))).toBe("1 800,00 HTG");
    expect(norm(formatMoney(money(2850, "USD"), "fr"))).toBe("28,50 USD");
    expect(norm(formatMoney(money(2850, "USD"), "ht"))).toBe("28,50 USD");
  });
  it("sums per currency without ever merging or converting", () => {
    const totals = sumByCurrency([money(100, "USD"), money(5000, "HTG"), money(250, "USD"), money(1000, "HTG")]);
    expect(totals).toEqual([{ amount: 6000, currency: "HTG" }, { amount: 350, currency: "USD" }]);
    expect(amountIn(totals, "USD")).toBe(350);
    expect(amountIn(totals, "EUR")).toBe(0);
    expect(sumByCurrency([])).toEqual([]);
    expect(() => addMoney(money(1, "HTG"), money(1, "USD"))).toThrow(/different currencies/);
  });
  it("converts typed major units without binary floating-point drift", () => {
    expect(majorToMinor(1.005, "USD")).toBe(101); // 1.005 * 100 === 100.49999999999999 in IEEE-754
    expect(majorToMinor(19.99, "USD")).toBe(1999);
    expect(majorToMinor(1800, "HTG")).toBe(180000);
    expect(minorToMajor(1999, "USD")).toBe(19.99);
  });
});
