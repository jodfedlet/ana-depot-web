import { describe, expect, it } from "vitest";
import { type CartLine, buildCartLine, cartReducer, cartSubtotals, lineTotal } from "./cart";
import { inCurrency } from "./catalog/offers";
import type { Product } from "./catalog-types";
import type { PriceDto, ProductDto, VariantDto } from "./api/dto";
import { toProduct } from "./api/map-catalog";

/** Test products built from API-shaped DTOs (MOCKED data: these tests prove the cart's pricing rules, not the backend). */
const price = (currency: string, retail: string, over: Partial<PriceDto> = {}): PriceDto => ({ currency, retailPrice: retail, salePrice: null, minOrderQuantity: 1, wholesaleEnabled: false, wholesaleTiers: [], ...over });
const dto = (id: string, prices: PriceDto[], variants: VariantDto[] = [], over: Partial<ProductDto> = {}): ProductDto => ({
  id, sku: id.toUpperCase(), slug: id, categoryId: "c", categorySlug: "c", name: { fr: id }, description: {}, brand: null, sellingUnit: "UNIT", unitNote: {}, prices, variants, images: [], attributes: [],
  availability: "IN_STOCK", availableQuantity: null, createdAt: "2026-01-01T00:00:00Z", ...over,
});
const make = (d: ProductDto): Product => toProduct(d, "fr")!;
const G = (n: number) => n * 100;
const variant = (id: string, over: Partial<VariantDto> = {}): VariantDto => ({ id, sku: id, axisValues: { size: id }, retailPrices: [], availability: "IN_STOCK", availableQuantity: null, ...over });

const chair = make(dto("chair", [price("HTG", "1100.00", { wholesaleEnabled: true, wholesaleTiers: [{ minQuantity: 10, unitPrice: "950.00" }, { minQuantity: 30, unitPrice: "850.00" }] })]));

describe("cart pricing follows quantity", () => {
  it("re-prices a line as the quantity crosses wholesale thresholds", () => {
    let lines: CartLine[] = cartReducer([], { type: "add", line: buildCartLine(chair, undefined, 1) });
    expect(lines[0]).toMatchObject({ quantity: 1, priceKind: "retail", unitPrice: { amount: G(1100) } });
    lines = cartReducer(lines, { type: "setQuantity", key: lines[0].key, quantity: 9 });
    expect(lines[0].unitPrice.amount).toBe(G(1100));
    lines = cartReducer(lines, { type: "setQuantity", key: lines[0].key, quantity: 10 });
    expect(lines[0]).toMatchObject({ priceKind: "wholesale", unitPrice: { amount: G(950) } });
    expect(lineTotal(lines[0]).amount).toBe(G(9500));
    lines = cartReducer(lines, { type: "setQuantity", key: lines[0].key, quantity: 45 });
    expect(lines[0].unitPrice.amount).toBe(G(850));
    lines = cartReducer(lines, { type: "setQuantity", key: lines[0].key, quantity: 5 });
    expect(lines[0].unitPrice.amount).toBe(G(1100));
  });
  it("merging adds quantities and re-prices the merged line", () => {
    let lines = cartReducer([], { type: "add", line: buildCartLine(chair, undefined, 6) });
    lines = cartReducer(lines, { type: "add", line: buildCartLine(chair, undefined, 5) });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 11, priceKind: "wholesale", unitPrice: { amount: G(950) } });
  });
  it("respects the minimum order quantity and the available stock", () => {
    const rope = make(dto("rope", [price("HTG", "100.00", { minOrderQuantity: 5 })]));
    expect(buildCartLine(rope, undefined, 1).quantity).toBe(5);
    let lines = cartReducer([], { type: "add", line: buildCartLine(rope, undefined, 10) });
    lines = cartReducer(lines, { type: "setQuantity", key: lines[0].key, quantity: 2 });
    expect(lines[0].quantity).toBe(5);
    const limited = { ...buildCartLine(chair, undefined, 1), maxQuantity: 8 };
    expect(cartReducer([], { type: "add", line: { ...limited, quantity: 50 } })[0].quantity).toBe(8);
  });
  it("keeps variant-specific prices and the proportional wholesale reduction", () => {
    const mattress = make(dto("mattress", [price("HTG", "4500.00", { wholesaleEnabled: true, wholesaleTiers: [{ minQuantity: 5, unitPrice: "4000.00" }] })],
      [variant("double", { retailPrices: [{ currency: "HTG", retailPrice: "6800.00" }], availableQuantity: 9 }), variant("large", { availableQuantity: 3 })]));
    const double = mattress.variants.find((v) => v.id === "double")!;
    expect(buildCartLine(mattress, double, 1).unitPrice.amount).toBe(G(6800));
    const many = cartReducer([], { type: "add", line: buildCartLine(mattress, double, 9) })[0];
    expect(many.priceKind).toBe("wholesale");
    expect(many.unitPrice.amount).toBe(Math.round(G(4000) * (6800 / 4500))); // the 4000/4500 tier, scaled to this size
    const large = mattress.variants.find((v) => v.id === "large")!;
    expect(buildCartLine(mattress, large, 10).quantity).toBe(3); // stock caps the quantity before any tier applies
  });
  it("removes, clears and totals", () => {
    const a = buildCartLine(chair, undefined, 2);
    const b = buildCartLine(make(dto("box", [price("HTG", "650.00")])), undefined, 3);
    const lines = [a, b];
    expect(cartSubtotals(lines)).toEqual([{ amount: G(1100) * 2 + G(650) * 3, currency: "HTG" }]);
    expect(cartReducer(lines, { type: "remove", key: a.key })).toEqual([b]);
    expect(cartReducer(lines, { type: "clear" })).toEqual([]);
    expect(cartSubtotals([])).toEqual([]);
  });
  it("shows a sale price as sale until a wholesale tier applies", () => {
    const sale = buildCartLine(make(dto("pot", [price("HTG", "3000.00", { salePrice: "2800.00" })])), undefined, 1);
    expect(sale).toMatchObject({ priceKind: "sale", unitPrice: { amount: G(2800) } });
  });
});

describe("cart keeps each line's currency (HTG and USD never merged or converted)", () => {
  const twoCurrencies = make(dto("tee", [price("HTG", "1500.00", { wholesaleEnabled: true, wholesaleTiers: [{ minQuantity: 10, unitPrice: "1300.00" }] }), price("USD", "12.00", { wholesaleEnabled: true, wholesaleTiers: [{ minQuantity: 10, unitPrice: "9.00" }] })]));
  it("re-pricing by quantity never changes the currency, in either currency", () => {
    for (const currency of ["HTG", "USD"]) {
      const line = buildCartLine(inCurrency(twoCurrencies, currency)!, undefined, 1);
      expect(line.unitPrice.currency).toBe(currency);
      const wholesale = cartReducer([line], { type: "setQuantity", key: line.key, quantity: 60 })[0];
      expect(wholesale.priceKind).toBe("wholesale");
      expect(wholesale.unitPrice.currency).toBe(currency);
      expect(lineTotal(wholesale).currency).toBe(currency);
    }
  });
  it("a mixed cart has one subtotal per currency and no combined amount", () => {
    let lines = cartReducer([], { type: "add", line: buildCartLine(inCurrency(twoCurrencies, "HTG")!, undefined, 2) });
    lines = cartReducer(lines, { type: "add", line: buildCartLine(inCurrency(twoCurrencies, "USD")!, undefined, 3) });
    const totals = cartSubtotals(lines);
    expect(totals.map((t) => t.currency)).toEqual(["HTG", "USD"]);
    expect(totals[0].amount).toBe(G(1500) * 2);
    expect(totals[1].amount).toBe(G(12) * 3);
  });
  it("the same item in HTG and in USD is two cart lines sharing ONE stock: together they cannot exceed it", () => {
    const shared = make(dto("shared", [price("HTG", "820.00"), price("USD", "110.00")], [], { availability: "IN_STOCK", availableQuantity: 3 }));
    let lines = cartReducer([], { type: "add", line: buildCartLine(inCurrency(shared, "HTG")!, undefined, 2) });
    lines = cartReducer(lines, { type: "add", line: buildCartLine(inCurrency(shared, "USD")!, undefined, 2) });
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map((l) => l.key)).size).toBe(2);
    expect(lines.map((l) => l.unitPrice)).toEqual([{ amount: G(820), currency: "HTG" }, { amount: G(110), currency: "USD" }]);
    expect(lines.map((l) => l.quantity)).toEqual([2, 1]); // only 1 of the 3 units was left for USD
    const up = cartReducer(lines, { type: "setQuantity", key: lines[1].key, quantity: 3 });
    expect(up[1].quantity).toBe(1);
    expect(cartSubtotals(up).map((t) => t.currency)).toEqual(["HTG", "USD"]);
  });
});
