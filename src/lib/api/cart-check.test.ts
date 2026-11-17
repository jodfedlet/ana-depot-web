import { describe, expect, it } from "vitest";
import { buildCartLine, checkLine } from "../cart";
import { inCurrency } from "../catalog/offers";
import type { Product } from "../catalog-types";
import { category, mattress } from "./fixtures";
import { toProduct } from "./map-catalog";

const product = (over: Partial<typeof mattress> = {}): Product => toProduct({ ...mattress, ...over }, "fr", category)!;
const lineIn = (p: Product, currency: string, variantId: string | undefined, qty: number) => {
  const sellable = inCurrency(p, currency)!;
  return buildCartLine(sellable, variantId ? sellable.variants.find((v) => v.id === variantId) : undefined, qty);
};

describe("checkLine with a variant that has its OWN price in the second currency (regression)", () => {
  const withUsdOverride = (): Product => product({ variants: [{ ...mattress.variants[0], retailPrices: [{ currency: "USD", retailPrice: "13.00" }] }, mattress.variants[1]] });
  it("an unchanged USD line of such a variant is NOT reported as a price change", () => {
    const p = withUsdOverride();
    const line = lineIn(p, "USD", "v-s", 2);
    expect(line.unitPrice).toEqual({ amount: 1300, currency: "USD" });
    expect(checkLine(line, p, 2)).toMatchObject({ kind: "ok" });
  });
  it("a real change of that override IS reported, in USD", () => {
    const line = lineIn(withUsdOverride(), "USD", "v-s", 2);
    const result = checkLine(line, product({ variants: [{ ...mattress.variants[0], retailPrices: [{ currency: "USD", retailPrice: "14.00" }] }, mattress.variants[1]] }), 2);
    expect(result).toMatchObject({ kind: "changed", before: { amount: 1300, currency: "USD" }, after: { amount: 1400, currency: "USD" } });
  });
});

describe("checkLine: the cart is revalidated against what the API says NOW (MOCKED data)", () => {
  const p = product();
  const htg = lineIn(p, "HTG", "v-s", 2);

  it("an unchanged line passes", () => {
    expect(checkLine(htg, p, 2)).toMatchObject({ kind: "ok" });
  });

  it("a product that is no longer published, a missing variant or a dropped currency is unavailable", () => {
    expect(checkLine(htg, undefined, 2)).toEqual({ kind: "unavailable" });
    expect(checkLine({ ...htg, variantId: "gone" }, p, 2)).toEqual({ kind: "unavailable" });
    const usdOnly = product({ prices: [mattress.prices[1]] });
    expect(checkLine(htg, usdOnly, 2)).toEqual({ kind: "unavailable" });
  });

  it("an out-of-stock product or variant is unavailable", () => {
    expect(checkLine(htg, product({ variants: [{ ...mattress.variants[0], availability: "OUT_OF_STOCK", availableQuantity: 0 }, mattress.variants[1]] }), 2)).toEqual({ kind: "unavailable" });
  });

  it("not enough units is reported with the available number (and never silently clamped)", () => {
    const low = product({ variants: [{ ...mattress.variants[0], availableQuantity: 1 }, mattress.variants[1]] });
    expect(checkLine(htg, low, 2)).toEqual({ kind: "insufficient", available: 1 });
  });

  it("HTG and USD lines of the SAME item share one stock: 2 + 2 of 3 is insufficient, 2 + 1 is fine", () => {
    const three = product({ variants: [{ ...mattress.variants[0], availableQuantity: 3 }, mattress.variants[1]] });
    const usd = lineIn(three, "USD", "v-s", 2);
    expect(checkLine(htg, three, 4)).toEqual({ kind: "insufficient", available: 3 });
    expect(checkLine(usd, three, 4)).toEqual({ kind: "insufficient", available: 3 });
    expect(checkLine(htg, three, 3)).toMatchObject({ kind: "ok" });
  });

  it("a price change is reported with before and after, in the SAME currency, and the refreshed line carries the new price", () => {
    const repriced = product({ prices: [{ ...mattress.prices[0], salePrice: null, retailPrice: "26000.00" }, mattress.prices[1]] });
    const result = checkLine(htg, repriced, 2);
    expect(result.kind).toBe("changed");
    if (result.kind !== "changed") return;
    expect(result.before).toEqual({ amount: 2250000, currency: "HTG" });
    expect(result.after).toEqual({ amount: 2600000, currency: "HTG" });
    expect(result.line.quantity).toBe(2);
    expect(result.line.unitPrice.currency).toBe("HTG");
  });

  it("a changed wholesale tier is also a price change; the quantity the customer chose is kept", () => {
    const five = lineIn(p, "HTG", "v-s", 5);
    expect(five.priceKind).toBe("wholesale");
    const noWholesale = product({ prices: [{ ...mattress.prices[0], wholesaleEnabled: false, wholesaleTiers: [] }, mattress.prices[1]] });
    const result = checkLine(five, noWholesale, 5);
    expect(result.kind).toBe("changed");
    if (result.kind === "changed") expect(result.line.quantity).toBe(5);
  });
});
