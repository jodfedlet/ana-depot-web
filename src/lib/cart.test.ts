import { describe, expect, it } from "vitest";
import { type CartLine, buildCartLine, cartReducer, cartSubtotals, lineTotal } from "./cart";
import { seedCategories, seedProducts } from "./mock/catalog-seed";
import { toProduct } from "./catalog/localize";

const product = (slug: string) => { const r = seedProducts.find((p) => p.slug === slug)!; return toProduct(r, seedCategories.find((c) => c.slug === r.categorySlug), "fr", []); };
const chair = product("chaise-empilable"); // 1100 retail; 10+ -> 950; 30+ -> 850 (HTG)
const G = (n: number) => n * 100;

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
    const rope = product("corde-nylon"); // min 5 m
    expect(buildCartLine(rope, undefined, 1).quantity).toBe(5);
    let lines = cartReducer([], { type: "add", line: buildCartLine(rope, undefined, 10) });
    lines = cartReducer(lines, { type: "setQuantity", key: lines[0].key, quantity: 2 });
    expect(lines[0].quantity).toBe(5);
    const limited = { ...buildCartLine(chair, undefined, 1), maxQuantity: 8 };
    expect(cartReducer([], { type: "add", line: { ...limited, quantity: 50 } })[0].quantity).toBe(8);
  });
  it("keeps variant-specific prices and the proportional wholesale reduction", () => {
    const mattress = product("matelas-mousse");
    const double = mattress.variants.find((v) => v.optionValues["Dimensions"] === "140×190 cm")!; // 6800, 9 in stock
    expect(buildCartLine(mattress, double, 1).unitPrice.amount).toBe(G(6800));
    const many = cartReducer([], { type: "add", line: buildCartLine(mattress, double, 9) })[0];
    expect(many.priceKind).toBe("wholesale");
    expect(many.unitPrice.amount).toBe(Math.round(G(4000) * (6800 / 4500))); // the 4000/4500 tier, scaled to this size
    const large = mattress.variants.find((v) => v.optionValues["Dimensions"] === "160×200 cm")!; // only 3 in stock
    expect(buildCartLine(mattress, large, 10).quantity).toBe(3); // stock caps the quantity before any tier applies
  });
  it("removes, clears and totals", () => {
    const a = buildCartLine(chair, undefined, 2);
    const b = buildCartLine(product("boite-vis"), undefined, 3);
    const lines = [a, b];
    expect(cartSubtotals(lines)).toEqual([{ amount: G(1100) * 2 + G(650) * 3, currency: "HTG" }]);
    expect(cartReducer(lines, { type: "remove", key: a.key })).toEqual([b]);
    expect(cartReducer(lines, { type: "clear" })).toEqual([]);
    expect(cartSubtotals([])).toEqual([]);
  });
  it("shows a sale price as sale until a wholesale tier applies", () => {
    const sale = buildCartLine(product("casserole-set"), undefined, 1);
    expect(sale).toMatchObject({ priceKind: "sale", unitPrice: { amount: G(2800) } });
  });
});
