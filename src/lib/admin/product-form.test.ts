import { describe, expect, it } from "vitest";
import type { AdminCategory, AdminProduct } from "../api/admin/dto";
import { axesOf, emptyProductForm, emptyVariant, formToRequest, looksLikeAmount, missingCombinations, productAttributesOf, productToForm } from "./product-form";

const category: AdminCategory = {
  id: "c1", slug: "vetements", name: { fr: "V", ht: "V" }, description: {}, imageUrl: null, active: true, displayOrder: 1, version: 1, createdAt: "", updatedAt: "", productCount: 0, activeProductCount: 0,
  attributes: [
    { id: "size", key: "size", label: { fr: "Taille" }, type: "CHOICE", unit: null, required: false, filterable: true, variantAxis: true, displayOrder: 1, active: true, valueCount: 0, options: [
      { id: "s", code: "s", label: { fr: "S" }, displayOrder: 1, active: true, useCount: 0 }, { id: "m", code: "m", label: { fr: "M" }, displayOrder: 2, active: true, useCount: 0 }, { id: "x", code: "x", label: { fr: "X" }, displayOrder: 3, active: false, useCount: 0 }] },
    { id: "mat", key: "material", label: { fr: "Matière" }, type: "CHOICE", unit: null, required: false, filterable: true, variantAxis: false, displayOrder: 2, active: true, valueCount: 0, options: [] },
  ],
};
const product: AdminProduct = {
  id: "p1", sku: "TEE-1", slug: "tee", categoryId: "c1", name: { fr: "Tee", ht: "Tishèt" }, description: {}, brand: null, unit: "UNIT", unitNote: {}, status: "ACTIVE", version: 7, createdAt: "", updatedAt: "",
  prices: [{ currency: "HTG", retail: "1500.00", sale: null, minOrderQuantity: 1, wholesaleEnabled: true, tiers: [{ minQuantity: 10, unitPrice: "1300.00" }], active: true }, { currency: "USD", retail: "12.00", sale: "10.50", minOrderQuantity: 2, wholesaleEnabled: false, tiers: [], active: true }],
  variants: [{ id: "v1", sku: "TEE-1-S", active: true, position: 1, axisValues: { size: "s" }, retailOverrides: { USD: "13.00" } }], attributes: [], images: [], stock: { onHand: 0, reserved: 0, available: 0, hasUntrackedPosition: false, state: "OUT", positions: [] },
};

describe("product form <-> API request (MOCKED shapes)", () => {
  it("round-trips one product with independent HTG and USD prices, tiers and per-currency variant overrides", () => {
    const f = productToForm(product);
    const req = formToRequest(f);
    expect(req.version).toBe(7);
    expect(req.prices.map((p) => [p.currency, p.retail, p.sale, p.minOrderQuantity])).toEqual([["HTG", "1500.00", null, undefined], ["USD", "12.00", "10.50", 2]]);
    expect(req.prices[0].tiers).toEqual([{ minQuantity: 10, unitPrice: "1300.00" }]);
    expect(req.variants[0]).toMatchObject({ id: "v1", sku: "TEE-1-S", axisValues: { size: "s" }, retailOverrides: { USD: "13.00" } });
  });
  it("a currency that is switched off is not sent (it is simply not sold); nothing is converted", () => {
    const f = productToForm(product);
    f.prices.USD.enabled = false;
    expect(formToRequest(f).prices.map((p) => p.currency)).toEqual(["HTG"]);
    expect(formToRequest(f).variants[0].retailOverrides).toEqual({});
  });
  it("amounts are the typed decimal text (comma accepted), never converted or rounded here", () => {
    const f = emptyProductForm("c1");
    f.prices.HTG.retail = "2 800,50".replace(" ", "");
    expect(formToRequest(f).prices[0].retail).toBe("2800.50");
    expect(looksLikeAmount("12.50")).toBe(true);
    expect(looksLikeAmount("12.505")).toBe(false);
    expect(looksLikeAmount("abc")).toBe(false);
  });
  it("a new product is created as DRAFT unless asked to publish; an existing one never sends a status", () => {
    expect(formToRequest(emptyProductForm("c1")).status).toBe("DRAFT");
    expect(formToRequest(emptyProductForm("c1"), { status: "ACTIVE" }).status).toBe("ACTIVE");
    expect(formToRequest(productToForm(product), { status: "ACTIVE" }).status).toBeUndefined();
  });
  it("wholesale tiers are only sent when wholesale is on", () => {
    const f = productToForm(product);
    f.prices.HTG.wholesaleEnabled = false;
    expect(formToRequest(f).prices[0].tiers).toEqual([]);
  });
  it("axes and combinations come from the category's variant-axis attributes (active options only), skipping existing variants", () => {
    expect(axesOf(category).map((a) => a.key)).toEqual(["size"]);
    const missing = missingCombinations(axesOf(category), [], "tee-1");
    expect(missing.map((v) => v.sku)).toEqual(["TEE-1-S", "TEE-1-M"]);
    expect(missingCombinations(axesOf(category), [{ ...emptyVariant(), axisValues: { size: "s" } }], "tee-1").map((v) => v.axisValues.size)).toEqual(["m"]);
  });
  it("a product WITHOUT a SKU (allowed by the API) loads and can generate combinations without crashing", () => {
    const f = productToForm({ ...product, sku: null as unknown as string, variants: [] });
    expect(f.sku).toBe("");
    expect(() => missingCombinations(axesOf(category), f.variants, f.sku)).not.toThrow();
    expect(formToRequest(f).sku).toBeUndefined();
  });
  it("the attribute section asks for everything except the axes that currently define variants", () => {
    expect(productAttributesOf(category, []).map((a) => a.key)).toEqual(["size", "material"]);
    expect(productAttributesOf(category, productToForm(product).variants).map((a) => a.key)).toEqual(["material"]);
  });
});
