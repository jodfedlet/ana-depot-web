import { describe, expect, it } from "vitest";
import { fr } from "./messages/fr";
import { ht } from "./messages/ht";
import { negotiateLocale } from "./config";
import { formatDate, formatDateTime } from "./format";
import { localizeHref, stripLocale } from "./navigation";
import { createT } from "./types";

type Node = string | { [k: string]: Node };
function flatten(node: Node, prefix = ""): Record<string, string> {
  if (typeof node === "string") return { [prefix]: node };
  return Object.entries(node).reduce((acc, [k, v]) => ({ ...acc, ...flatten(v, prefix ? `${prefix}.${k}` : k) }), {} as Record<string, string>);
}
const frFlat = flatten(fr as unknown as Node);
const htFlat = flatten(ht as unknown as Node);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
// Keys that may legitimately be identical or empty in both languages
const SAME_OK = /history\.entry$|\.(moncash|natcash)$|^common\.sample$|catalog\.(minPlaceholder|maxPlaceholder)|product\.off$|reserve\.payment\.(moncash|natcash)|\.(min|max)$|^catalog\.sort\.name-asc$/;

describe("translations", () => {
  it("has exactly the same keys in French and Haitian Creole", () => {
    expect(Object.keys(htFlat).sort()).toEqual(Object.keys(frFlat).sort());
  });
  it("has no empty messages", () => {
    for (const [k, v] of [...Object.entries(frFlat), ...Object.entries(htFlat)]) expect(v.trim(), k).not.toBe("");
  });
  it("uses the same {placeholders} in both languages", () => {
    for (const k of Object.keys(frFlat)) expect(placeholders(htFlat[k]), k).toBe(placeholders(frFlat[k]));
  });
  it("does not leave Haitian Creole identical to French (an untranslated string)", () => {
    const untranslated = Object.keys(frFlat).filter((k) => frFlat[k] === htFlat[k] && frFlat[k].length > 12 && !SAME_OK.test(k));
    expect(untranslated).toEqual([]);
  });
  it("keeps the two languages out of each other (no French article words in ht UI text)", () => {
    const leaked = Object.entries(htFlat).filter(([k, v]) => !/\.(languageName)/.test(k) && /\b(votre|vous|réservation|retrait)\b/i.test(v));
    expect(leaked.map(([k]) => k)).toEqual([]);
  });
});

describe("home positioning: Ana Dépôt is a general-merchandise store, not a specialist", () => {
  // The hero must not name a product specialty, in either language (the illustration alt text may list several categories).
  const SPECIALTY = {
    fr: /matelas|meuble|literie|draps?\b|quincaillerie|mat[ée]riaux|construction|chaussure|v[êe]tement|cuisine|maison|ameublement|d[ée]coration/i,
    ht: /matla|m[èe]b|dra\b|dra |kay\b|matery[èe]l|konstriksyon|soulye|rad\b|kizin|dekorasyon/i,
  };
  const MARKETPLACE = { fr: /marketplace|place de march[ée]|vendeurs/i, ht: /marketplace|machann yo|plizy[èe] machann/i };
  const heroKeys = ["eyebrow", "title", "description", "primary", "secondary"] as const;
  const copy = (m: typeof fr | typeof ht) => heroKeys.map((k) => m.home.hero[k]).join(" | ");

  it("names no single product category or specialty in the hero (fr and ht)", () => {
    expect(copy(fr)).not.toMatch(SPECIALTY.fr);
    expect(copy(ht)).not.toMatch(SPECIALTY.ht);
    expect(copy(fr)).not.toMatch(MARKETPLACE.fr);
    expect(copy(ht)).not.toMatch(MARKETPLACE.ht);
  });
  it("conveys variety, online reservation, quantity pricing and pickup in both languages", () => {
    const fr_ = copy(fr), ht_ = copy(ht);
    expect(fr_).toMatch(/tout ce qu'il vous faut|produits de toutes sortes/i);
    expect(fr_).toMatch(/r[ée]servez en ligne/i);
    expect(fr_).toMatch(/quantit[ée]/i);
    expect(fr_).toMatch(/[àa] l'unit[ée] ou en quantit[ée]/i);
    expect(fr_).toMatch(/retir(ez|er)/i);
    expect(ht_).toMatch(/tout sa w bezwen|tout kalite pwodwi/i);
    expect(ht_).toMatch(/rez[èe]v(e|asyon) .*ent[èe]n[èe]t/i);
    expect(ht_).toMatch(/an detay oswa an gwo/i);
    expect(ht_).toMatch(/pran .*magazen/i);
  });
  it("keeps the hero headline short and the same story in both languages", () => {
    expect(fr.home.hero.title.length).toBeLessThanOrEqual(60);
    expect(ht.home.hero.title.length).toBeLessThanOrEqual(60);
    // the illustration description lists several categories, never just one
    expect(fr.home.hero.imageAlt.split(/,|—|et/).length).toBeGreaterThanOrEqual(5);
    expect(ht.home.hero.imageAlt.split(/,|—|ak/).length).toBeGreaterThanOrEqual(5);
  });
  it("describes the store in the site metadata as retail and wholesale without naming a specialty", () => {
    expect(fr.site.description).not.toMatch(SPECIALTY.fr);
    expect(ht.site.description).not.toMatch(SPECIALTY.ht);
    expect(fr.announcement.message).not.toMatch(SPECIALTY.fr);
  });
});

describe("translator", () => {
  it("interpolates and picks plural forms per language", () => {
    const tf = createT(fr, "fr");
    const th = createT(ht, "ht");
    expect(tf("catalog.count", { count: 1 })).toBe("1 produit");
    expect(tf("catalog.count", { count: 0 })).toBe("0 produit");
    expect(tf("catalog.count", { count: 5 })).toBe("5 produits");
    expect(th("catalog.count", { count: 5 })).toBe("5 pwodwi");
    expect(tf("reserve.review.title")).toBe("Vérifiez votre réservation");
    expect(th("status.ready_for_pickup")).toBe("Pare pou pran");
  });
});

describe("locale helpers", () => {
  it("suggests a language from Accept-Language", () => {
    expect(negotiateLocale("ht-HT,ht;q=0.9,en;q=0.5")).toBe("ht");
    expect(negotiateLocale("en-US,fr;q=0.8")).toBe("fr");
    expect(negotiateLocale("en-US")).toBe("fr"); // default language
    expect(negotiateLocale(null)).toBe("fr");
  });
  it("prefixes internal links only", () => {
    expect(localizeHref("/products?x=1", "ht")).toBe("/ht/products?x=1");
    expect(localizeHref("/", "fr")).toBe("/fr");
    expect(localizeHref("https://example.com/a", "fr")).toBe("https://example.com/a");
    expect(localizeHref("mailto:a@b.c", "fr")).toBe("mailto:a@b.c");
    expect(localizeHref("#top", "fr")).toBe("#top");
  });
  it("strips the locale prefix", () => {
    expect(stripLocale("/ht/products")).toBe("/products");
    expect(stripLocale("/fr")).toBe("/");
    expect(stripLocale("/products")).toBe("/products");
  });
});

describe("date formatting", () => {
  it("uses Haitian Creole month names (Intl has no ht data) in the store time zone", () => {
    expect(formatDate("2026-11-14T15:20:00Z", "ht")).toBe("14 novanm 2026");
    expect(formatDate("2026-11-14T15:20:00Z", "fr")).toBe("14 novembre 2026");
    expect(formatDateTime("2026-11-14T15:20:00Z", "ht", "short")).toBe("14 nov. 2026 · 10:20"); // UTC-5 in November
    expect(formatDate("2026-03-02T12:00:00Z", "ht", "short")).toBe("2 mas 2026");
  });
});
