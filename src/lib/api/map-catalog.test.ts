import { describe, expect, it } from "vitest";
import { category, mattress, simple } from "./fixtures";
import type { ProductDto } from "./dto";
import { PLACEHOLDER_IMAGE, safeImageUrl, toCategory, toProduct } from "./map-catalog";

describe("toProduct: API product -> customer view (MOCKED contract fixtures, not the real server)", () => {
  const p = toProduct(mattress, "fr", category)!;

  it("keeps ONE product with an independent price block per currency, in minor units, never converted", () => {
    expect(p.id).toBe("p1");
    expect(p.offers.map((o) => o.currency)).toEqual(["HTG", "USD"]);
    expect(p.offers[0]).toMatchObject({ price: { amount: 2250000, currency: "HTG" }, compareAtPrice: { amount: 2500000, currency: "HTG" }, minOrderQty: 1, hasWholesale: true });
    expect(p.offers[1]).toMatchObject({ price: { amount: 18000, currency: "USD" }, compareAtPrice: undefined, minOrderQty: 2 });
    expect(p.offers[0].pricing.wholesale.tiers).toEqual([{ minQty: 5, unitPrice: 2000000 }]);
    expect(p.offers[1].pricing.wholesale.tiers).toEqual([{ minQty: 5, unitPrice: 16500 }]);
    // every amount keeps its own currency
    for (const o of p.offers) expect([o.price.currency, o.compareAtPrice?.currency ?? o.currency, ...o.pricing.wholesale.tiers.map(() => o.pricing.currency)].every((c) => c === o.currency)).toBe(true);
  });

  it("exposes only the available quantity (never on-hand or reserved) and maps availability", () => {
    expect(p.availability).toBe("in_stock");
    expect(p.availableQty).toBe(15);
    expect(JSON.stringify(p)).not.toMatch(/onHand|reserved/);
    expect(p.variants.map((v) => [v.availability, v.availableQty])).toEqual([["in_stock", 12], ["low_stock", 3]]);
    const simpleP = toProduct(simple, "fr")!;
    expect(simpleP.availability).toBe("in_stock");
    expect(simpleP.availableQty).toBeUndefined(); // untracked: no number is invented
  });

  it("unknown availability is shown as unavailable, never as in stock", () => {
    expect(toProduct({ ...mattress, availability: "WHATEVER" as ProductDto["availability"] }, "fr", category)!.availability).toBe("out_of_stock");
  });

  it("names variant options and specifications from the category, per language", () => {
    expect(p.options).toEqual([{ name: "Taille", values: [{ value: "Petit" }, { value: "Grand" }] }]);
    expect(p.variants[1].optionValues).toEqual({ Taille: "Grand" });
    expect(p.specifications).toEqual([{ label: "Épaisseur", value: "20 cm" }, { label: "Remarque", value: "Ferme" }]);
    const ht = toProduct(mattress, "ht", category)!;
    expect(ht.name).toBe("Matla konfò");
    expect(ht.options[0]).toMatchObject({ name: "Gwosè", values: [{ value: "Piti" }, { value: "Gran" }] });
    // a missing translation falls back to the other language instead of showing nothing
    expect(toProduct(simple, "ht")!.name).toBe("Casserole");
  });

  it("variant with its own price keeps it per currency; others use the product price", () => {
    expect(p.variants[1].prices).toEqual({ HTG: { amount: 3000000, currency: "HTG" } });
    expect(p.variants[0].prices).toBeUndefined();
    expect(p.offers[0].variantPrices).toEqual({ "v-l": { amount: 3000000, currency: "HTG" } });
  });

  it("filterable choice attributes use the option CODE as their URL-stable id", () => {
    const withAttr = toProduct({ ...mattress, attributes: [{ attributeId: "a-size", optionId: "o-l", text: null, number: null }] }, "fr", category)!;
    expect(withAttr.attributes).toEqual({ size: { id: "l", label: "Grand", name: "Taille" } });
  });

  it("orders images by position and only keeps http(s) URLs", () => {
    expect(p.images.map((i) => i.src)).toEqual(["https://images.example/a.jpg", "https://images.example/b.jpg"]);
    expect(p.images[0].alt).toBe("Vue de face");
    const bad = toProduct({ ...mattress, images: [{ id: "x", url: "javascript:alert(1)", alt: {}, position: 0 }, { id: "y", url: "data:image/png;base64,AAAA", alt: {}, position: 1 }] }, "fr", category)!;
    expect(bad.images).toEqual([{ src: PLACEHOLDER_IMAGE, alt: bad.name }]);
    expect(toProduct(simple, "fr")!.images[0].src).toBe(PLACEHOLDER_IMAGE);
  });

  it("drops a currency whose price cannot be read, and the product when none can (no invented price)", () => {
    const oneBad = toProduct({ ...mattress, prices: [{ ...mattress.prices[0], retailPrice: "abc" }, mattress.prices[1]] }, "fr", category)!;
    expect(oneBad.offers.map((o) => o.currency)).toEqual(["USD"]);
    expect(toProduct({ ...simple, prices: [{ ...simple.prices[0], retailPrice: "-1" }] }, "fr")).toBeNull();
    // a malformed wholesale tier removes the wholesale offer for that currency instead of showing a wrong discount
    const badTier = toProduct({ ...mattress, prices: [{ ...mattress.prices[0], wholesaleTiers: [{ minQuantity: 5, unitPrice: "oops" }] }, mattress.prices[1]] }, "fr", category)!;
    expect(badTier.offers[0].hasWholesale).toBe(false);
  });

  it("maps units and splits the description into paragraphs", () => {
    expect(p.unit).toBe("unit");
    expect(toProduct(simple, "fr")!.unit).toBe("set");
    expect(p.description).toEqual(["Un.", "Deux."]);
  });
});

describe("toCategory and image URLs", () => {
  it("localizes and falls back to a neutral image", () => {
    expect(toCategory(category, "ht")).toMatchObject({ slug: "mattresses", name: "Matla", description: "Pour dormir", image: { src: PLACEHOLDER_IMAGE } });
  });
  it("accepts only http(s) URLs", () => {
    expect(safeImageUrl("https://x.test/a.png")).toBe("https://x.test/a.png");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "/relative.png", "", null, undefined, "not a url"]) expect(safeImageUrl(bad as string)).toBeNull();
  });
});
