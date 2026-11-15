import { describe, expect, it } from "vitest";
import { seedCategories, seedMovements, seedProducts } from "../mock/catalog-seed";
import { sampleReservations } from "../mock/reservations";
import { toProduct } from "./localize";
import { emptyCategory, validateCategory, attributeKey } from "./category";
import { type ProductDraft, draftToRecord, emptyDraft, generateVariants, recordToDraft, slugify, uniqueSlug, validateDraft } from "./draft";
import { reservedQty, stockOf, stockState, availabilityOf } from "./stock";
import { L } from "../localized";

const cat = (slug: string) => seedCategories.find((c) => c.slug === slug)!;
const prod = (slug: string) => seedProducts.find((p) => p.slug === slug)!;
const valid = (over: Partial<ProductDraft> = {}): ProductDraft => ({ ...emptyDraft("household"), nameFr: "Seau", sku: "SEA-1", retail: "1500", unit: "unit", onHand: "10", ...over });

describe("seed catalog is internally consistent", () => {
  it("every product points at a real category and uses only that category's attributes/options", () => {
    for (const p of seedProducts) {
      const c = cat(p.categorySlug);
      expect(c, p.slug).toBeDefined();
      for (const [k, v] of Object.entries(p.attributes)) {
        const def = c.attributes.find((a) => a.key === k);
        expect(def, `${p.slug}.${k}`).toBeDefined();
        if (def!.type === "select") expect(def!.options.map((o) => o.id), `${p.slug}.${k}`).toContain(v);
      }
    }
  });
  it("SKUs are unique across products and variants", () => {
    const skus = seedProducts.flatMap((p) => [p.sku, ...p.variants.map((v) => v.sku)]).filter(Boolean);
    expect(new Set(skus).size).toBe(skus.length);
  });
  it("covers the model's range: variants, packs/boxes/meters, wholesale on/off, untracked, draft and inactive", () => {
    expect(seedProducts.some((p) => p.variants.length > 0)).toBe(true);
    expect(seedProducts.some((p) => p.variants.length === 0)).toBe(true);
    for (const u of ["unit", "pair", "pack", "box", "set", "meter"]) expect(seedProducts.some((p) => p.unit === u), u).toBe(true);
    expect(seedProducts.some((p) => p.pricing.wholesale.enabled)).toBe(true);
    expect(seedProducts.some((p) => !p.pricing.wholesale.enabled)).toBe(true);
    expect(seedProducts.some((p) => !p.inventory.tracked)).toBe(true);
    expect(seedProducts.map((p) => p.status)).toEqual(expect.arrayContaining(["draft", "active", "inactive"]));
    expect(cat("general").attributes).toEqual([]);
  });
  it("opening stock movements add up to the current stock", () => {
    const moves = seedMovements();
    for (const p of seedProducts.filter((x) => x.inventory.tracked)) {
      const targets = p.variants.length ? p.variants.map((v) => ({ id: v.id, onHand: v.onHand })) : [{ id: undefined, onHand: p.inventory.onHand }];
      for (const t of targets) {
        if (t.onHand === 0 && !moves.some((m) => m.productId === p.id && m.variantId === t.id)) continue;
        const sum = moves.filter((m) => m.productId === p.id && m.variantId === t.id).reduce((n, m) => n + m.delta, 0);
        expect(sum, `${p.slug} ${t.id}`).toBe(t.onHand);
      }
    }
  });
});

describe("stock: physical, reserved and available", () => {
  it("reserves open reservations only; released when rejected, cancelled or expired; deducted when collected", () => {
    const withLine = (status: "pending_review" | "rejected" | "collected") => {
      const r = structuredClone(sampleReservations[0]);
      r.status = status;
      r.lines = [{ ...r.lines[0], productId: "p-009", variantId: undefined, quantity: 7 }];
      return r;
    };
    expect(reservedQty([withLine("pending_review")], "p-009")).toBe(7);
    expect(reservedQty([withLine("rejected")], "p-009")).toBe(0);
    expect(reservedQty([withLine("collected")], "p-009")).toBe(0);
    const info = stockOf(prod("chaise-empilable"), [withLine("pending_review")]);
    expect(info).toMatchObject({ onHand: 80, reserved: 7, available: 73 });
  });
  it("tracks reservations per variant and never goes below zero", () => {
    const p = prod("matelas-mousse");
    const v = p.variants.find((x) => x.optionValues.size === "large")!;
    const r = structuredClone(sampleReservations[0]);
    r.status = "confirmed";
    r.lines = [{ ...r.lines[0], productId: p.id, variantId: v.id, quantity: 5 }];
    expect(stockOf(p, [r], v.id)).toMatchObject({ onHand: 3, reserved: 5, available: 0 });
    expect(stockOf(p, [r], p.variants[0].id).reserved).toBe(0);
  });
  it("derives customer availability, low-stock only when the seller set a threshold, and manual availability when untracked", () => {
    const chair = prod("chaise-empilable");
    expect(availabilityOf(chair, stockOf(chair, []))).toBe("in_stock");
    expect(stockState({ ...chair, inventory: { ...chair.inventory, onHand: 8 } }, stockOf({ ...chair, inventory: { ...chair.inventory, onHand: 8 } }, []))).toBe("low");
    const noThreshold = { ...chair, inventory: { ...chair.inventory, onHand: 2, lowStockThreshold: undefined } };
    expect(stockState(noThreshold, stockOf(noThreshold, []))).toBe("ok");
    const made = prod("table-basse");
    expect(availabilityOf(made, stockOf(made, []))).toBe("preorder");
    expect(availabilityOf({ ...made, inventory: { ...made.inventory, manualAvailability: "out_of_stock" } }, stockOf(made, []))).toBe("out_of_stock");
  });
});

describe("localized storefront product", () => {
  it("builds names, specifications and facets from the category's attribute definitions, per language", () => {
    const fr = toProduct(prod("tube-rond-galva"), cat("metal"), "fr", []);
    const ht = toProduct(prod("tube-rond-galva"), cat("metal"), "ht", []);
    expect(fr.name).toBe("Tube rond galvanisé 6 m");
    expect(ht.name).toBe("Tib won galvanize 6 m");
    expect(fr.specifications).toEqual(expect.arrayContaining([{ label: "Matériau", value: "Acier galvanisé" }, { label: "Longueur", value: "6 m" }]));
    expect(ht.attributes.material).toMatchObject({ id: "galv", name: "Materyèl", label: "Asye galvanize" });
    expect(fr.hasWholesale).toBe(true);
    expect(fr.variants).toHaveLength(3);
  });
  it("shows a promotion as price + struck-through retail, and works without images or wholesale", () => {
    const sale = toProduct(prod("casserole-set"), cat("household"), "fr", []);
    expect(sale.price.amount).toBe(280000);
    expect(sale.compareAtPrice?.amount).toBe(320000);
    const none = toProduct({ ...prod("boite-vis"), images: [] }, cat("general"), "fr", []);
    expect(none.images).toHaveLength(1);
    expect(toProduct(prod("corniere-acier"), cat("metal"), "fr", []).hasWholesale).toBe(false);
  });
  it("falls back to the other language when a translation is missing", () => {
    const p = toProduct({ ...prod("seau-pack"), name: L("Seau", "") }, cat("household"), "ht", []);
    expect(p.name).toBe("Seau");
  });
});

describe("product validation", () => {
  it("lets an almost-empty draft be saved, but needs a name", () => {
    expect(validateDraft(emptyDraft(), undefined, [], "draft")).toEqual({ name: "nameRequired" });
    expect(validateDraft({ ...emptyDraft(), nameHt: "Bokit" }, undefined, [], "draft")).toEqual({});
  });
  it("requires category, SKU and a valid retail price to publish", () => {
    const e = validateDraft({ ...emptyDraft(), nameFr: "Seau" }, undefined, [], "publish");
    expect(e).toMatchObject({ category: "categoryRequired", sku: "skuRequired", retail: "retailInvalid" });
    expect(validateDraft(valid(), cat("household"), [], "publish")).toEqual({});
  });
  it("flags duplicate SKUs (product vs others, variant vs variant)", () => {
    expect(validateDraft(valid(), cat("household"), ["SEA-1"], "draft").sku).toBe("skuDuplicate");
    const d = valid({ hasVariants: true, options: [{ key: "s", fr: "Taille", ht: "Gwosè", values: [{ id: "a", fr: "A", ht: "A" }, { id: "b", fr: "B", ht: "B" }] }] });
    d.variants = generateVariants(d.options, [], "SEA");
    d.variants[1].sku = d.variants[0].sku;
    expect(validateDraft(d, cat("household"), [], "publish")["variant.1.sku"]).toBe("skuDuplicate");
  });
  it("requires the category's required attributes and numeric values for number attributes", () => {
    const e = validateDraft(valid({ categorySlug: "metal" }), cat("metal"), [], "publish");
    expect(e["attr.material"]).toBe("attrRequired");
    expect(validateDraft(valid({ categorySlug: "metal", attributes: { material: "galv", length: "abc" } }), cat("metal"), [], "publish")["attr.length"]).toBe("attrNumber");
  });
  it("shows no attribute requirements for a category without attributes", () => {
    expect(validateDraft(valid({ categorySlug: "general" }), cat("general"), [], "publish")).toEqual({});
  });
  it("validates wholesale tiers only when enabled, and reports row-level problems", () => {
    expect(validateDraft(valid({ tiers: [{ minQty: "1", unitPrice: "9999" }] }), cat("household"), [], "publish")).toEqual({});
    const e = validateDraft(valid({ wholesaleEnabled: true, tiers: [{ minQty: "10", unitPrice: "1300" }, { minQty: "5", unitPrice: "1400" }] }), cat("household"), [], "publish");
    expect(e["tier.1.tierOrder"]).toBe("tierOrder");
    expect(validateDraft(valid({ wholesaleEnabled: true, tiers: [] }), cat("household"), [], "publish").tiers).toBe("tiersEmpty");
  });
  it("needs at least one variant when variants are on, and valid stock numbers", () => {
    const e = validateDraft(valid({ hasVariants: true, options: [{ key: "s", fr: "T", ht: "T", values: [{ id: "a", fr: "A", ht: "A" }] }] }), cat("household"), [], "publish");
    expect(e.variants).toBe("variantsRequired");
    expect(validateDraft(valid({ onHand: "-3" }), cat("household"), [], "publish").onHand).toBe("stockInvalid");
    expect(validateDraft(valid({ tracked: false, onHand: "abc" }), cat("household"), [], "publish")).toEqual({});
  });
});

describe("draft ↔ record", () => {
  it("round-trips every sample product without losing data", () => {
    for (const p of seedProducts) {
      const back = draftToRecord(recordToDraft(p), { id: p.id, slug: p.slug, now: p.updatedAt, createdAt: p.createdAt, featuredRank: p.featuredRank, isNew: p.isNew, relatedIds: p.relatedIds, isSample: p.isSample });
      expect(back.pricing, p.slug).toEqual({ ...p.pricing, sale: p.pricing.sale, minOrderQty: p.pricing.minOrderQty });
      expect(back.variants.map((v) => [v.sku, v.price, v.onHand]), p.slug).toEqual(p.variants.map((v) => [v.sku, v.price, v.onHand]));
      expect(back.attributes, p.slug).toEqual(p.attributes);
      expect(back.name).toEqual(p.name);
      expect(back.unit).toBe(p.unit);
    }
  });
  it("generates variant combinations and keeps what already exists", () => {
    const options = [
      { key: "size", fr: "Taille", ht: "Gwosè", values: [{ id: "s", fr: "S", ht: "S" }, { id: "m", fr: "M", ht: "M" }] },
      { key: "color", fr: "Couleur", ht: "Koulè", values: [{ id: "red", fr: "Rouge", ht: "Wouj" }, { id: "blue", fr: "Bleu", ht: "Ble" }] },
    ];
    const first = generateVariants(options, [], "TS");
    expect(first).toHaveLength(4);
    first[0].price = "900";
    first[0].onHand = "7";
    const again = generateVariants([{ ...options[0], values: [...options[0].values, { id: "l", fr: "L", ht: "L" }] }, options[1]], first, "TS");
    expect(again).toHaveLength(6);
    expect(again.find((v) => v.optionValues.size === "s" && v.optionValues.color === "red")).toMatchObject({ price: "900", onHand: "7" });
  });
  it("builds readable unique slugs", () => {
    expect(slugify("Matelas à mousse 16 cm !")).toBe("matelas-a-mousse-16-cm");
    expect(uniqueSlug("Seau", ["seau", "seau-2"])).toBe("seau-3");
  });
});

describe("category validation", () => {
  it("needs a name, and select attributes need options; only selects can filter or define variants", () => {
    expect(validateCategory(emptyCategory(1), [])).toEqual({ name: "nameRequired" });
    const c = { ...emptyCategory(1), name: L("Outils", "Zouti"), attributes: [
      { key: "a", label: L("", ""), type: "select" as const, options: [], filterable: false, required: false, variantAxis: false },
      { key: "b", label: L("Poids", "Pwa"), type: "number" as const, options: [], filterable: true, required: false, variantAxis: false },
    ] };
    expect(validateCategory(c, [])).toMatchObject({ "attr.0.label": "labelRequired", "attr.0.options": "optionsRequired", "attr.1.type": "selectOnly" });
    expect(attributeKey(L("Poids net", ""), ["poids_net"])).toBe("poids_net_2");
  });
});
