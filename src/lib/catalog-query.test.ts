import { describe, expect, it } from "vitest";
import { catalogHref, deriveFacets, parseCatalogQuery, queryCatalog } from "./catalog-query";
import { toCategory, toProduct } from "./catalog/localize";
import { seedCategories, seedProducts } from "./mock/catalog-seed";

const build = (l: "fr" | "ht") => seedProducts.filter((p) => p.status === "active").map((p) => toProduct(p, seedCategories.find((c) => c.slug === p.categorySlug), l, []));
const fr = build("fr");
const ht = build("ht");
const names = (l: "fr" | "ht") => Object.fromEntries(seedCategories.map((c) => [c.slug, toCategory(c, l).name]));

describe("parseCatalogQuery", () => {
  it("parses filters and converts price to minor units", () => {
    const q = parseCatalogQuery({ q: " lampe ", min: "1000", max: "3800.5", stock: "1", sort: "price-asc", brand: ["A", "B"], attr: ["material:glass"], page: "2" });
    expect(q).toMatchObject({ q: "lampe", minPrice: 100000, maxPrice: 380050, inStockOnly: true, sort: "price-asc", brands: ["A", "B"], attributes: { material: ["glass"] }, page: 2 });
  });
  it("ignores invalid values", () => {
    const q = parseCatalogQuery({ min: "abc", sort: "bogus", page: "-3" });
    expect(q.minPrice).toBeUndefined();
    expect(q.sort).toBeUndefined();
    expect(q.page).toBe(1);
  });
});

describe("queryCatalog (localized)", () => {
  it("finds the same products in both languages by their own words", () => {
    const inFr = queryCatalog(fr, { q: "tube" }, names("fr"));
    const inHt = queryCatalog(ht, { q: "tib" }, names("ht"));
    expect(inFr.products.map((p) => p.id)).toContain("p-001");
    expect(inHt.products.map((p) => p.id)).toContain("p-001");
    expect(queryCatalog(fr, { q: "zzzz" }, names("fr")).total).toBe(0);
  });
  it("filters by category, stock and price", () => {
    expect(queryCatalog(fr, { category: "furniture", pageSize: 50 }, names("fr")).products.every((p) => p.categorySlug === "furniture")).toBe(true);
    const all = queryCatalog(fr, { pageSize: 50 }, names("fr"));
    const inStock = queryCatalog(fr, { inStockOnly: true, pageSize: 50 }, names("fr"));
    expect(inStock.total).toBe(all.total - fr.filter((p) => p.availability === "out_of_stock").length);
  });
  it("never compares prices across currencies: ranges need a selected currency when the catalog mixes HTG and USD", () => {
    expect(new Set(fr.map((p) => p.price.currency))).toEqual(new Set(["HTG", "USD"]));
    const mixed = queryCatalog(fr, { pageSize: 50 }, names("fr"));
    expect(mixed.priceBounds).toBeNull(); // no single currency => no range
    expect(mixed.currencies.map((c) => c.code)).toEqual(["HTG", "USD"]);
    // a max price typed against a mixed list is ignored rather than applied to both currencies
    expect(queryCatalog(fr, { maxPrice: 3000, pageSize: 50 }, names("fr")).total).toBe(mixed.total);
    const htg = queryCatalog(fr, { currency: "HTG", maxPrice: 150000, pageSize: 50 }, names("fr"));
    expect(htg.products.length).toBeGreaterThan(0);
    expect(htg.products.every((p) => p.price.currency === "HTG" && p.price.amount <= 150000)).toBe(true);
    expect(htg.priceBounds?.currency).toBe("HTG");
    const usd = queryCatalog(fr, { currency: "USD", maxPrice: 2000, pageSize: 50 }, names("fr"));
    expect(usd.products.every((p) => p.price.currency === "USD" && p.price.amount <= 2000)).toBe(true);
    expect(usd.products.length).toBeGreaterThan(0);
    expect(parseCatalogQuery({ currency: "usd", max: "20" })).toMatchObject({ currency: "USD", maxPrice: 2000 });
    expect(parseCatalogQuery({ currency: "EUR" }).currency).toBeUndefined(); // unsupported currencies are ignored
  });
  it("filters by attribute id, which is the same in every language", () => {
    const a = queryCatalog(fr, { attributes: { material: ["galv"] }, pageSize: 50 }, names("fr")).products.map((p) => p.id);
    const b = queryCatalog(ht, { attributes: { material: ["galv"] }, pageSize: 50 }, names("ht")).products.map((p) => p.id);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(b).toEqual(a);
  });
  it("sorts and paginates", () => {
    // price order never mixes currencies: products are grouped by currency, then ordered by price inside each group
    const sorted = queryCatalog(fr, { sort: "price-asc", pageSize: 50 }, names("fr"));
    expect(sorted.priceSortGrouped).toBe(true);
    for (const code of ["HTG", "USD"]) {
      const amounts = sorted.products.filter((p) => p.price.currency === code).map((p) => p.price.amount);
      expect(amounts).toEqual([...amounts].sort((x, y) => x - y));
    }
    const order = sorted.products.map((p) => p.price.currency);
    expect(order).toEqual([...order].sort((a, b) => (a === b ? 0 : a === "HTG" ? -1 : 1)));
    const oneCurrency = queryCatalog(fr, { currency: "HTG", sort: "price-desc", pageSize: 50 }, names("fr"));
    expect(oneCurrency.priceSortGrouped).toBe(false);
    const desc = oneCurrency.products.map((p) => p.price.amount);
    expect(desc).toEqual([...desc].sort((x, y) => y - x));
    const p2 = queryCatalog(fr, { page: 2, pageSize: 12 }, names("fr"));
    expect(p2.products).toHaveLength(Math.max(0, fr.length - 12));
    expect(queryCatalog(fr, { page: 99, pageSize: 12 }, names("fr")).page).toBe(p2.pageCount);
  });
  it("derives facets with localized labels and stable ids", () => {
    const f = deriveFacets(ht).find((g) => g.key === "material");
    expect(f?.name).toBe("Materyèl");
    expect(f?.values.map((v) => v.id)).toEqual(expect.arrayContaining(["galv", "wood", "plastic"]));
    expect(f?.values.find((v) => v.id === "galv")?.label).toBe("Asye galvanize");
  });
  it("round-trips a query through the URL, resetting the page on filter changes", () => {
    const q = parseCatalogQuery({ category: "home", sort: "newest", page: "2" });
    expect(catalogHref("/products", q, { inStockOnly: true })).toBe("/products?category=home&sort=newest&stock=1");
    expect(catalogHref("/products", q, { page: 3 })).toBe("/products?category=home&sort=newest&page=3");
  });
});
