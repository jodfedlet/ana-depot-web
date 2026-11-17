import { describe, expect, it } from "vitest";
import { catalogHref, parseCatalogQuery } from "./catalog-query";

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

describe("catalog URL", () => {
  it("round-trips a query through the URL, resetting the page on filter changes", () => {
    const q = parseCatalogQuery({ category: "home", sort: "newest", page: "2" });
    expect(catalogHref("/products", q, { inStockOnly: true })).toBe("/products?category=home&sort=newest&stock=1");
    expect(catalogHref("/products", q, { page: 3 })).toBe("/products?category=home&sort=newest&page=3");
  });
});
