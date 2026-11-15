import { describe, expect, it } from "vitest";
import { type PricingSnapshot, lineTotalFor, priceRanges, snapshotFor, unitPriceFor, validatePricing } from "./pricing";

const snap = (over: Partial<PricingSnapshot> = {}): PricingSnapshot => ({ currency: "HTG", base: 1000, retail: 1000, tiers: [{ minQty: 5, unitPrice: 900 }, { minQty: 10, unitPrice: 800 }], minQty: 1, ...over });

describe("quantity pricing", () => {
  it("applies retail below the first tier and each tier from its threshold", () => {
    expect(unitPriceFor(snap(), 1)).toMatchObject({ unitPrice: 1000, kind: "retail" });
    expect(unitPriceFor(snap(), 4).unitPrice).toBe(1000);
    expect(unitPriceFor(snap(), 5)).toMatchObject({ unitPrice: 900, kind: "wholesale" });
    expect(unitPriceFor(snap(), 9).unitPrice).toBe(900);
    expect(unitPriceFor(snap(), 10).unitPrice).toBe(800);
    expect(unitPriceFor(snap(), 500).unitPrice).toBe(800);
    expect(lineTotalFor(snap(), 10)).toBe(8000);
  });
  it("tells the customer how many more units unlock the next tier", () => {
    expect(unitPriceFor(snap(), 3).next).toEqual({ minQty: 5, unitPrice: 900, moreNeeded: 2, saving: 100 });
    expect(unitPriceFor(snap(), 5).next?.minQty).toBe(10);
    expect(unitPriceFor(snap(), 10).next).toBeUndefined();
  });
  it("works for products without wholesale pricing", () => {
    expect(unitPriceFor(snap({ tiers: [] }), 100)).toMatchObject({ unitPrice: 1000, kind: "retail" });
    expect(unitPriceFor(snap({ tiers: [] }), 1).next).toBeUndefined();
  });
  it("treats a promotional base price as 'sale' below the tiers", () => {
    expect(unitPriceFor(snap({ base: 900, retail: 1000, tiers: [{ minQty: 5, unitPrice: 800 }] }), 1)).toMatchObject({ unitPrice: 900, kind: "sale" });
  });
  it("never lets a wholesale price exceed the base price", () => {
    expect(unitPriceFor(snap({ base: 700, retail: 700 }), 5).unitPrice).toBe(700);
  });
  it("builds snapshots from pricing: sale price, variant override and the disabled flag", () => {
    const pricing = { currency: "HTG" as const, retail: 1000, sale: 900, wholesale: { enabled: true, tiers: [{ minQty: 10, unitPrice: 800 }, { minQty: 5, unitPrice: 850 }] }, minOrderQty: 2 };
    expect(snapshotFor(pricing)).toMatchObject({ base: 900, retail: 1000, minQty: 2, tiers: [{ minQty: 5, unitPrice: 850 }, { minQty: 10, unitPrice: 800 }] });
    // a variant with its own price keeps the same proportional wholesale reduction (850/1000 -> 1020/1200)
    expect(snapshotFor(pricing, 1200)).toMatchObject({ base: 1200, retail: 1200, tiers: [{ minQty: 5, unitPrice: 1020 }, { minQty: 10, unitPrice: 960 }] });
    expect(snapshotFor({ ...pricing, wholesale: { enabled: false, tiers: pricing.wholesale.tiers } }).tiers).toEqual([]);
  });
  it("lists the price-by-quantity ranges shown to customers", () => {
    expect(priceRanges(snap())).toEqual([
      { from: 1, to: 4, unitPrice: 1000, kind: "retail" },
      { from: 5, to: 9, unitPrice: 900, kind: "wholesale" },
      { from: 10, to: undefined, unitPrice: 800, kind: "wholesale" },
    ]);
    expect(priceRanges(snap({ tiers: [], minQty: 3 }))).toEqual([{ from: 3, to: undefined, unitPrice: 1000, kind: "retail" }]);
  });
});

describe("pricing validation", () => {
  const ok = { retail: 1000, wholesaleEnabled: true, tiers: [{ minQty: 5, unitPrice: 900 }, { minQty: 10, unitPrice: 800 }] };
  const codes = (p: Parameters<typeof validatePricing>[0]) => validatePricing(p).map((i) => i.code);
  it("accepts a coherent configuration, with or without wholesale", () => {
    expect(codes(ok)).toEqual([]);
    expect(codes({ retail: 500, wholesaleEnabled: false, tiers: [] })).toEqual([]);
  });
  it("ignores tiers while wholesale is off", () => {
    expect(codes({ retail: 500, wholesaleEnabled: false, tiers: [{ minQty: 1, unitPrice: 9999 }] })).toEqual([]);
  });
  it("rejects bad retail, sale and minimum order values", () => {
    expect(codes({ ...ok, wholesaleEnabled: false, retail: 0 })).toContain("retailInvalid");
    expect(codes({ ...ok, wholesaleEnabled: false, sale: 1000 })).toContain("saleInvalid");
    expect(codes({ ...ok, wholesaleEnabled: false, minOrderQty: 0 })).toContain("minOrderInvalid");
  });
  it("requires at least one tier when wholesale is on", () => {
    expect(codes({ ...ok, tiers: [] })).toContain("tiersEmpty");
  });
  it("rejects overlapping or unordered thresholds", () => {
    expect(validatePricing({ ...ok, tiers: [{ minQty: 5, unitPrice: 900 }, { minQty: 5, unitPrice: 800 }] })).toContainEqual({ code: "tierOrder", index: 1 });
    expect(validatePricing({ ...ok, tiers: [{ minQty: 10, unitPrice: 900 }, { minQty: 5, unitPrice: 800 }] })).toContainEqual({ code: "tierOrder", index: 1 });
  });
  it("rejects thresholds below 2 and prices that do not go down", () => {
    expect(validatePricing({ ...ok, tiers: [{ minQty: 1, unitPrice: 900 }] })).toContainEqual({ code: "tierQtyInvalid", index: 0 });
    expect(validatePricing({ ...ok, tiers: [{ minQty: 5, unitPrice: 1000 }] })).toContainEqual({ code: "tierAboveBase", index: 0 });
    expect(validatePricing({ ...ok, tiers: [{ minQty: 5, unitPrice: 800 }, { minQty: 10, unitPrice: 850 }] })).toContainEqual({ code: "tierPriceOrder", index: 1 });
    expect(validatePricing({ ...ok, tiers: [{ minQty: 5, unitPrice: 0 }] })).toContainEqual({ code: "tierPriceInvalid", index: 0 });
  });
  it("measures tiers against the sale price when there is one", () => {
    expect(validatePricing({ ...ok, sale: 850, tiers: [{ minQty: 5, unitPrice: 860 }] })).toContainEqual({ code: "tierAboveBase", index: 0 });
  });
});
