import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/catalog-types";
import { breadcrumbJsonLd, decimalPrice, jsonLdString, organizationJsonLd, productJsonLd, productOffers, websiteJsonLd } from "./jsonld";
import { PRIVATE_PATHS, pageMetadata } from "./metadata";
import { absoluteUrl, languageAlternates, localizedPath, seoWarnings, siteOrigin } from "./site";
import { buildSitemap } from "./sitemap";
import { plainSnippet } from "./text";

const ORIGIN = "https://shop.example";

describe("site origin and URLs", () => {
  it("accepts only an http(s) origin and drops any path", () => {
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "https://shop.example/some/path?x=1" })).toBe(ORIGIN);
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toBeNull();
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "not a url" })).toBeNull();
  });
  it("falls back to localhost in development only; production without a value has no origin", () => {
    expect(siteOrigin({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(siteOrigin({ NODE_ENV: "production" })).toBeNull();
    expect(seoWarnings({ NODE_ENV: "production" })).toHaveLength(1);
    expect(seoWarnings({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: ORIGIN })).toHaveLength(0);
  });
  it("builds localized paths and hreflang alternates with x-default", () => {
    expect(localizedPath("fr", "/")).toBe("/fr");
    expect(localizedPath("ht", "/products/x")).toBe("/ht/products/x");
    expect(absoluteUrl("fr", "/products", ORIGIN)).toBe(`${ORIGIN}/fr/products`);
    expect(absoluteUrl("fr", "/products", null)).toBeNull();
    expect(languageAlternates("/products/x", ORIGIN)).toEqual({ fr: `${ORIGIN}/fr/products/x`, ht: `${ORIGIN}/ht/products/x`, "x-default": `${ORIGIN}/fr/products/x` });
  });
});

describe("plainSnippet", () => {
  it("collapses whitespace and cuts at a word boundary", () => {
    expect(plainSnippet("  a   b\n\nc ")).toBe("a b c");
    const long = "mot ".repeat(100);
    const s = plainSnippet(long, 50);
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s.endsWith("…")).toBe(true);
    expect(s).not.toMatch(/mo…$/);
  });
  it("handles empty input", () => expect(plainSnippet(undefined)).toBe(""));
});

describe("pageMetadata", () => {
  it("has one canonical per page, hreflang, Open Graph and Twitter", () => {
    const m = pageMetadata({ locale: "ht", path: "/products/x", title: "X", description: "D", image: "https://img.example/x.jpg" }, ORIGIN);
    expect(m.alternates?.canonical).toBe(`${ORIGIN}/ht/products/x`);
    expect(m.alternates?.languages).toMatchObject({ fr: `${ORIGIN}/fr/products/x`, ht: `${ORIGIN}/ht/products/x`, "x-default": `${ORIGIN}/fr/products/x` });
    expect(m.openGraph).toMatchObject({ title: "X", url: `${ORIGIN}/ht/products/x`, locale: "ht_HT", images: [{ url: "https://img.example/x.jpg" }] });
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
    expect(m.robots).toBeUndefined();
  });
  it("omits absolute URLs without an origin and supports noindex", () => {
    const m = pageMetadata({ locale: "fr", path: "/info/terms", title: "T", noindex: true }, null);
    expect(m.alternates).toBeUndefined();
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.twitter).toMatchObject({ card: "summary" });
  });
});

const product = (over: Partial<Product> = {}): Product => ({
  id: "p1", slug: "tee-shirt", sku: "TS-1", name: "Tee-shirt", description: ["Coton doux.", "Lavable."], categorySlug: "vetements", categoryName: "Vêtements", brand: "Marque",
  price: { amount: 150000, currency: "HTG" }, offers: [
    { currency: "HTG", price: { amount: 150000, currency: "HTG" }, pricing: {} as never, minOrderQty: 1, hasWholesale: true, variantPrices: {} },
    { currency: "USD", price: { amount: 1050, currency: "USD" }, compareAtPrice: { amount: 1200, currency: "USD" }, pricing: {} as never, minOrderQty: 1, hasWholesale: false, variantPrices: {} },
  ],
  images: [{ src: "https://img.example/a.jpg", alt: "a" }, { src: "/sample/placeholder.svg", alt: "p" }], availability: "in_stock", options: [], variants: [], attributes: {}, specifications: [],
  createdAt: "2026-01-01T00:00:00Z", featuredRank: 0, unit: "unit", pricing: {} as never, minOrderQty: 1, hasWholesale: true, ...over,
}) as Product;

describe("JSON-LD", () => {
  it("formats decimal prices from minor units without float drift", () => {
    expect(decimalPrice(150000, "HTG")).toBe("1500.00");
    expect(decimalPrice(5, "USD")).toBe("0.05");
    expect(decimalPrice(1050, "USD")).toBe("10.50");
  });
  it("escapes everything that could close the script tag", () => {
    const s = jsonLdString({ name: "</script><script>alert(1)</script> & <b>" });
    expect(s).not.toContain("<");
    expect(s).not.toContain(">");
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script> & <b>");
  });
  it("emits ONE offer per currency with its own priceCurrency (sale price as the price) and the API's availability", () => {
    const offers = productOffers(product(), `${ORIGIN}/fr/products/tee-shirt`);
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ "@type": "Offer", priceCurrency: "HTG", price: "1500.00", availability: "https://schema.org/InStock" });
    expect(offers[1]).toMatchObject({ "@type": "Offer", priceCurrency: "USD", price: "10.50" });
    expect(JSON.stringify(offers)).not.toMatch(/ratingValue|reviewCount|shipping|aggregateRating/);
  });
  it("maps unavailable products to OutOfStock and low stock to LimitedAvailability", () => {
    expect(productOffers(product({ availability: "out_of_stock" }), null)[0]).toMatchObject({ availability: "https://schema.org/OutOfStock" });
    expect(productOffers(product({ availability: "low_stock" }), null)[0]).toMatchObject({ availability: "https://schema.org/LimitedAvailability" });
  });
  it("uses an AggregateOffer (lowest to highest) when variants carry their own price in a currency, never mixing currencies", () => {
    const p = product({
      variants: [{ id: "v1" }, { id: "v2" }] as Product["variants"],
      offers: [{ currency: "USD", price: { amount: 1000, currency: "USD" }, pricing: {} as never, minOrderQty: 1, hasWholesale: false, variantPrices: { v1: { amount: 1000, currency: "USD" }, v2: { amount: 1300, currency: "USD" } } }],
    });
    expect(productOffers(p, null)[0]).toMatchObject({ "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: "10.00", highPrice: "13.00", offerCount: 2 });
  });
  it("builds a Product from real data only: no placeholder image, no invented fields", () => {
    const j = productJsonLd(product(), "fr", ORIGIN);
    expect(j).toMatchObject({ "@type": "Product", name: "Tee-shirt", sku: "TS-1", brand: { "@type": "Brand", name: "Marque" }, url: `${ORIGIN}/fr/products/tee-shirt`, image: ["https://img.example/a.jpg"] });
    expect(Object.keys(j).sort()).toEqual(["@context", "@type", "brand", "category", "description", "image", "name", "offers", "sku", "url"]);
    const bare = productJsonLd(product({ sku: "", brand: undefined, images: [{ src: "/sample/placeholder.svg", alt: "p" }], description: [] }), "fr", null);
    expect(bare).not.toHaveProperty("image");
    expect(bare).not.toHaveProperty("sku");
    expect(bare).not.toHaveProperty("brand");
    expect(bare).not.toHaveProperty("url");
  });
  it("describes the organization and the site with only configured data", () => {
    expect(organizationJsonLd(ORIGIN)).toEqual({ "@context": "https://schema.org", "@type": "Organization", name: "Ana Dépôt", url: ORIGIN });
    const site = websiteJsonLd("fr", ORIGIN);
    expect(site).toMatchObject({ "@type": "WebSite", inLanguage: "fr", url: `${ORIGIN}/fr` });
    expect(JSON.stringify(site)).toContain("/fr/search?q={search_term_string}");
    expect(JSON.stringify(organizationJsonLd(null))).not.toContain("url");
  });
  it("numbers breadcrumb positions and links every crumb that has a path", () => {
    const b = breadcrumbJsonLd("fr", [{ name: "Accueil", path: "/" }, { name: "Boutique", path: "/products" }, { name: "X" }], ORIGIN) as { itemListElement: Record<string, unknown>[] };
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(b.itemListElement[0].item).toBe(`${ORIGIN}/fr`);
    expect(b.itemListElement[2]).not.toHaveProperty("item");
  });
});

describe("private paths (robots.txt)", () => {
  it("keeps account, auth, reservation, cart, search and payment pages out of crawling", () => {
    for (const p of ["/admin", "/account", "/auth", "/reserve", "/reservations", "/cart", "/search", "/payment"]) expect(PRIVATE_PATHS).toContain(p);
  });
});

describe("sitemap", () => {
  const source = { categories: [{ slug: "maison" }], products: [{ slug: "tee-shirt" }] };
  it("lists public pages in both languages with hreflang alternates and no private pages", () => {
    const entries = buildSitemap(source, ORIGIN);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${ORIGIN}/fr`);
    expect(urls).toContain(`${ORIGIN}/ht/products/tee-shirt`);
    expect(urls).toContain(`${ORIGIN}/fr/categories/maison`);
    expect(urls).toContain(`${ORIGIN}/fr/info/how-it-works`);
    expect(urls.some((u) => /\/(admin|account|auth|cart|search|reserve|reservations|payment)(\/|$)/.test(u))).toBe(false);
    expect(urls.some((u) => /\/info\/(terms|privacy|returns)$/.test(u))).toBe(false);
    expect(urls.some((u) => u.includes("?"))).toBe(false);
    const product = entries.find((e) => e.url === `${ORIGIN}/fr/products/tee-shirt`);
    expect(product?.alternates?.languages).toMatchObject({ fr: `${ORIGIN}/fr/products/tee-shirt`, ht: `${ORIGIN}/ht/products/tee-shirt` });
    expect(product).not.toHaveProperty("lastModified");
  });
  it("is empty without a site origin instead of listing relative URLs", () => expect(buildSitemap(source, null)).toEqual([]));
});
