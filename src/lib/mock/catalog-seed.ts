/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║ SAMPLE DATA — NOT REAL INVENTORY OR PRICES                           ║
 * ║ Categories, attributes, products, prices (HTG and USD) and stock below only  ║
 * ║ demonstrate the flexible catalog. The seller replaces them in the    ║
 * ║ administration. Only the catalog demo store may import this file.    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import { L, type LText } from "../localized";
import type { CurrencyCode } from "../money";
import type { AttributeDef, CategoryRecord, Pricing, PriceTier, ProductRecord, StockMovement, VariantOption, VariantRecord } from "../catalog/model";

/** Sample amounts are written in major units; both HTG and USD have 2 minor digits. Each product carries its own currency. */
const htg = (n: number) => n * 100;
const usd = (n: number) => n * 100;
const SEED_STAFF = "Personnel exemple";
const D = "2026-10-01T09:00:00Z";

const opts = (...pairs: [string, LText][]) => pairs.map(([id, label]) => ({ id, label }));
const sel = (key: string, fr: string, ht: string, options: [string, LText][], extra: Partial<AttributeDef> = {}): AttributeDef => ({
  key, label: L(fr, ht), type: "select", options: opts(...options), filterable: false, required: false, variantAxis: false, ...extra,
});
const num = (key: string, fr: string, ht: string, unit: string, extra: Partial<AttributeDef> = {}): AttributeDef => ({ key, label: L(fr, ht), type: "number", unit, options: [], filterable: false, required: false, variantAxis: false, ...extra });
const txt = (key: string, fr: string, ht: string, extra: Partial<AttributeDef> = {}): AttributeDef => ({ key, label: L(fr, ht), type: "text", options: [], filterable: false, required: false, variantAxis: false, ...extra });

const COLORS: [string, LText][] = [["black", L("Noir", "Nwa")], ["white", L("Blanc", "Blan")], ["brown", L("Marron", "Mawon")], ["green", L("Vert", "Vèt")]];

export const seedCategories: CategoryRecord[] = [
  {
    slug: "metal", name: L("Matériaux métalliques", "Materyèl metal"), description: L("Tubes, fer à béton et profilés.", "Tib, fè beton ak pwofile."), image: "/sample/categories/metal.svg", active: true, order: 1,
    attributes: [
      sel("material", "Matériau", "Materyèl", [["galv", L("Acier galvanisé", "Asye galvanize")], ["iron", L("Fer", "Fè")], ["alu", L("Aluminium", "Alimin")]], { filterable: true, required: true }),
      num("length", "Longueur", "Longè", "m"), num("diameter", "Diamètre", "Dyamèt", "mm"), num("thickness", "Épaisseur", "Epesè", "mm"),
    ],
  },
  {
    slug: "shoes", name: L("Chaussures", "Soulye"), description: L("Chaussures pour tous les jours.", "Soulye pou chak jou."), image: "/sample/categories/shoes.svg", active: true, order: 2,
    attributes: [
      txt("model", "Modèle", "Modèl"),
      sel("material", "Matière", "Matyè", [["leather", L("Cuir", "Po")], ["textile", L("Textile", "Twal")], ["synthetic", L("Synthétique", "Sentetik")]], { filterable: true }),
      sel("audience", "Public", "Piblik", [["men", L("Hommes", "Gason")], ["women", L("Femmes", "Fanm")], ["kids", L("Enfants", "Timoun")]], { filterable: true }),
      sel("size", "Pointure", "Pwenti", ["38", "39", "40", "41", "42", "43", "44"].map((n) => [`s${n}`, L(n, n)] as [string, LText]), { variantAxis: true }),
      sel("color", "Couleur", "Koulè", COLORS, { variantAxis: true, filterable: true }),
    ],
  },
  {
    slug: "bedding", name: L("Literie", "Dra ak matla"), description: L("Matelas, draps et parures.", "Matla, dra ak seri dra."), image: "/sample/categories/bedding.svg", active: true, order: 3,
    attributes: [
      sel("material", "Matière", "Matyè", [["cotton", L("Coton", "Koton")], ["polyester", L("Polyester", "Poliyèstè")], ["foam", L("Mousse", "Mous")]], { filterable: true }),
      sel("size", "Dimensions", "Dimansyon", [["single", L("1 place (90×190 cm)", "1 plas (90×190 cm)")], ["double", L("2 places (140×190 cm)", "2 plas (140×190 cm)")], ["large", L("Grand lit (160×200 cm)", "Gwo kabann (160×200 cm)")]], { variantAxis: true }),
      num("thickness", "Épaisseur", "Epesè", "cm"),
      sel("type", "Type", "Kalite", [["foam", L("Mousse", "Mous")], ["spring", L("Ressorts", "Resò")]], { filterable: true }),
    ],
  },
  {
    slug: "furniture", name: L("Meubles", "Mèb"), description: L("Tables, chaises et rangements.", "Tab, chèz ak rangman."), image: "/sample/categories/furniture.svg", active: true, order: 4,
    attributes: [
      sel("material", "Matériau", "Materyèl", [["wood", L("Bois", "Bwa")], ["metal", L("Métal", "Metal")], ["plastic", L("Plastique", "Plastik")]], { filterable: true }),
      sel("color", "Couleur", "Koulè", COLORS, { filterable: true, variantAxis: true }),
      sel("shape", "Forme", "Fòm", [["rect", L("Rectangulaire", "Rektangilè")], ["round", L("Ronde", "Won")], ["square", L("Carrée", "Kare")]], { filterable: true }),
      txt("dimensions", "Dimensions", "Dimansyon"),
    ],
  },
  {
    slug: "household", name: L("Maison", "Kay"), description: L("Articles pour la maison.", "Atik pou kay la."), image: "/sample/categories/household.svg", active: true, order: 5,
    attributes: [
      sel("material", "Matériau", "Materyèl", [["plastic", L("Plastique", "Plastik")], ["steel", L("Inox", "Inoks")]], { filterable: true }),
      txt("capacity", "Capacité", "Kapasite"),
    ],
  },
  // A category with NO predefined attributes: products here need only the general fields.
  { slug: "general", name: L("Divers", "Divès"), description: L("Autres articles.", "Lòt atik."), image: "/sample/categories/general.svg", active: true, order: 6, attributes: [] },
];

// ---------- helpers ----------
const img = (slug: string, extra: string[] = []) => [1, 2, 3].map((n) => ({ src: `/sample/products/${slug}-${n}.svg` })).concat(extra.map((e) => ({ src: `/sample/products/${slug}${e}.svg` })));
const optAxis = (key: string, fr: string, ht: string, values: [string, string, string?, string?][]): VariantOption => ({ key, label: L(fr, ht), values: values.map(([id, f, h, sw]) => ({ id, label: L(f, h ?? f), swatch: sw })) });

function variantsOf(sku: string, options: VariantOption[], fn: (ids: Record<string, string>, i: number) => Partial<VariantRecord> & { onHand: number }): VariantRecord[] {
  let combos: Record<string, string>[] = [{}];
  for (const o of options) combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.key]: v.id })));
  return combos.map((c, i) => ({ id: `${sku.toLowerCase()}-v${i + 1}`, sku: `${sku}-${Object.values(c).join("-").toUpperCase()}`, optionValues: c, active: true, ...fn(c, i) }));
}

const base = (id: string, slug: string, sku: string, name: LText, description: LText, categorySlug: string, rest: Omit<Partial<ProductRecord>, "prices"> & { prices: (Omit<Pricing, "currency"> & { currency?: CurrencyCode })[] }): ProductRecord => ({
  id, slug, sku, name, description, categorySlug, images: img(slug), status: "active", unit: "unit", unitNote: L("", ""), attributes: {}, options: [], variants: [],
  inventory: { tracked: true, onHand: 0, manualAvailability: "in_stock" }, createdAt: "2026-09-10T10:00:00Z", updatedAt: "2026-10-05T10:00:00Z", featuredRank: 99, isSample: true, ...rest,
  // A price set is HTG unless it says otherwise. Sample shoes and bed linen are USD-only; the foam mattress is sold in BOTH currencies (one product, two independent price sets, one stock).
  prices: rest.prices.map((p) => ({ currency: "HTG" as CurrencyCode, ...p })),
});
const wh = (tiers: PriceTier[]) => ({ enabled: true, tiers: tiers.map((t) => ({ minQty: t.minQty, unitPrice: htg(t.unitPrice) })) });
const off = { enabled: false, tiers: [] as PriceTier[] };

// ---------- products ----------
const diam = optAxis("diameter", "Diamètre", "Dyamèt", [["d25", "25 mm"], ["d32", "32 mm"], ["d40", "40 mm"]]);
const rebar = optAxis("diameter", "Diamètre", "Dyamèt", [["d8", "8 mm"], ["d10", "10 mm"], ["d12", "12 mm"]]);
const shoeSize = optAxis("size", "Pointure", "Pwenti", ["39", "40", "41", "42", "43"].map((n) => [`s${n}`, n, n] as [string, string, string]));
const shoeColor = optAxis("color", "Couleur", "Koulè", [["black", "Noir", "Nwa", "#1c1b19"], ["white", "Blanc", "Blan", "#f2eee6"]]);
const sandSize = optAxis("size", "Pointure", "Pwenti", ["38", "39", "40", "41", "42"].map((n) => [`s${n}`, n, n] as [string, string, string]));
const matSize = optAxis("size", "Dimensions", "Dimansyon", [["single", "90×190 cm"], ["double", "140×190 cm"], ["large", "160×200 cm"]]);
const sheetSize = optAxis("size", "Dimensions", "Dimansyon", [["single", "1 place", "1 plas"], ["double", "2 places", "2 plas"]]);
const tableSize = optAxis("size", "Taille", "Gwosè", [["p4", "4 places", "4 plas"], ["p6", "6 places", "6 plas"]]);

/** `featuredRank` orders the home page: the first eight alternate categories so no single category dominates the storefront. */
export const seedProducts: ProductRecord[] = [
  base("p-001", "tube-rond-galva", "TUB-RND", L("Tube rond galvanisé 6 m", "Tib won galvanize 6 m"), L("Tube rond en acier galvanisé, longueur 6 m. Description d'exemple.", "Tib won an asye galvanize, longè 6 m. Deskripsyon egzanp."), "metal", {
    prices: [{ retail: htg(1800), wholesale: wh([{ minQty: 10, unitPrice: 1650 }, { minQty: 50, unitPrice: 1500 }]) }], featuredRank: 2, relatedIds: ["p-002", "p-003"],
    attributes: { material: "galv", length: "6", thickness: "2" }, options: [diam],
    variants: variantsOf("TUB-RND", [diam], (c) => ({ prices: c.diameter === "d32" ? { HTG: htg(2400) } : c.diameter === "d40" ? { HTG: htg(3200) } : undefined, onHand: c.diameter === "d25" ? 140 : c.diameter === "d32" ? 90 : 6 })),
    inventory: { tracked: true, onHand: 0, lowStockThreshold: 10, manualAvailability: "in_stock" }, isNew: true,
  }),
  base("p-002", "fer-a-beton", "FER-BET", L("Fer à béton 12 m", "Fè beton 12 m"), L("Barre de fer à béton, longueur 12 m. Description d'exemple.", "Ba fè beton, longè 12 m. Deskripsyon egzanp."), "metal", {
    prices: [{ retail: htg(950), wholesale: wh([{ minQty: 20, unitPrice: 880 }, { minQty: 100, unitPrice: 820 }]), minOrderQty: 5 }], featuredRank: 8, relatedIds: ["p-001", "p-003"],
    attributes: { material: "iron", length: "12" }, options: [rebar],
    variants: variantsOf("FER-BET", [rebar], (c) => ({ prices: c.diameter === "d10" ? { HTG: htg(1400) } : c.diameter === "d12" ? { HTG: htg(1900) } : undefined, onHand: c.diameter === "d8" ? 300 : c.diameter === "d10" ? 220 : 40 })),
    inventory: { tracked: true, onHand: 0, lowStockThreshold: 50, manualAvailability: "in_stock" },
  }),
  base("p-003", "corniere-acier", "COR-ACI", L("Cornière en acier 40×40", "Kònyè asye 40×40"), L("Cornière en acier, 6 m. Produit sans variante, sans prix de gros.", "Kònyè asye, 6 m. Pwodwi san varyant, san pri an gwo."), "metal", {
    prices: [{ retail: htg(2600), wholesale: off }], featuredRank: 11, attributes: { material: "galv", length: "6", thickness: "3" }, inventory: { tracked: true, onHand: 12, lowStockThreshold: 5, manualAvailability: "in_stock" },
  }),
  base("p-004", "baskets-sport", "BSK-SPT", L("Baskets de sport", "Soulye espò"), L("Baskets légères pour le sport et la marche. Une pointure et une couleur à choisir.", "Soulye lejè pou espò ak mache. Chwazi yon pwenti ak yon koulè."), "shoes", {
    unit: "pair", prices: [{ currency: "USD", retail: usd(28), wholesale: wh([{ minQty: 6, unitPrice: 25 }, { minQty: 12, unitPrice: 23 }]) }], featuredRank: 1, images: img("baskets-sport", ["-blanc"]), relatedIds: ["p-005"],
    attributes: { model: "Sport 1", material: "synthetic", audience: "men" }, options: [shoeSize, shoeColor],
    variants: variantsOf("BSK-SPT", [shoeSize, shoeColor], (c, i) => ({ onHand: 12 - (i % 5) * 2, imageIndex: c.color === "white" ? 3 : 0 })),
    inventory: { tracked: true, onHand: 0, lowStockThreshold: 3, manualAvailability: "in_stock" }, isNew: true,
  }),
  base("p-005", "sandales-cuir", "SND-CUI", L("Sandales en cuir", "Sandal an po"), L("Sandales en cuir véritable, plusieurs pointures.", "Sandal an vrè po, plizyè pwenti."), "shoes", {
    unit: "pair", prices: [{ currency: "USD", retail: usd(15), wholesale: off }], featuredRank: 6, attributes: { model: "Été", material: "leather", audience: "women" }, options: [sandSize],
    variants: variantsOf("SND-CUI", [sandSize], (c) => ({ onHand: c.size === "s40" ? 0 : 9 })), inventory: { tracked: true, onHand: 0, lowStockThreshold: 2, manualAvailability: "in_stock" },
  }),
  base("p-006", "matelas-mousse", "MAT-MOU", L("Matelas en mousse", "Matla an mous"), L("Matelas en mousse haute densité. Le prix dépend des dimensions.", "Matla an mous ki di. Pri a depann de dimansyon yo."), "bedding", {
    prices: [
      { retail: htg(4500), wholesale: wh([{ minQty: 5, unitPrice: 4000 }, { minQty: 10, unitPrice: 3700 }]) },
      // Same mattress, same stock: an independent USD price set (its own retail and wholesale tiers).
      { currency: "USD", retail: usd(60), wholesale: wh([{ minQty: 5, unitPrice: 54 }, { minQty: 10, unitPrice: 50 }]) },
    ], featuredRank: 3, relatedIds: ["p-007"],
    attributes: { material: "foam", thickness: "16", type: "foam" }, options: [matSize],
    variants: variantsOf("MAT-MOU", [matSize], (c) => ({ prices: c.size === "double" ? { HTG: htg(6800), USD: usd(90) } : c.size === "large" ? { HTG: htg(8200), USD: usd(110) } : undefined, onHand: c.size === "single" ? 24 : c.size === "double" ? 9 : 3 })),
    inventory: { tracked: true, onHand: 0, lowStockThreshold: 4, manualAvailability: "in_stock" },
  }),
  base("p-007", "drap-coton-set", "DRP-COT", L("Parure de draps en coton", "Seri dra an koton"), L("Drap-housse, drap plat et deux taies d'oreiller.", "Dra ki mete sou matla a, dra plat ak de tèt zòrye."), "bedding", {
    unit: "set", unitNote: L("1 drap-housse + 1 drap plat + 2 taies", "1 dra matla + 1 dra plat + 2 tèt zòrye"), prices: [{ currency: "USD", retail: usd(19), wholesale: wh([{ minQty: 6, unitPrice: 17 }]) }], featuredRank: 9, relatedIds: ["p-006"],
    attributes: { material: "cotton" }, options: [sheetSize], variants: variantsOf("DRP-COT", [sheetSize], (c) => ({ prices: c.size === "double" ? { USD: usd(26) } : undefined, onHand: c.size === "single" ? 35 : 22 })), inventory: { tracked: true, onHand: 0, manualAvailability: "in_stock" },
  }),
  base("p-008", "table-a-manger", "TAB-MNG", L("Table à manger", "Tab pou manje"), L("Table à manger en bois, deux tailles.", "Tab pou manje an bwa, de gwosè."), "furniture", {
    prices: [{ retail: htg(9500), wholesale: off }], featuredRank: 5, relatedIds: ["p-009", "p-010"], attributes: { material: "wood", color: "brown", shape: "rect" }, options: [tableSize],
    variants: variantsOf("TAB-MNG", [tableSize], (c) => ({ prices: c.size === "p6" ? { HTG: htg(13500) } : undefined, onHand: c.size === "p4" ? 5 : 2 })), inventory: { tracked: true, onHand: 0, lowStockThreshold: 2, manualAvailability: "in_stock" },
  }),
  base("p-009", "chaise-empilable", "CHS-EMP", L("Chaise empilable", "Chèz ki ka anpile"), L("Chaise empilable, idéale pour les groupes.", "Chèz ki ka anpile, bon pou gwo gwoup."), "furniture", {
    prices: [{ retail: htg(1100), wholesale: wh([{ minQty: 10, unitPrice: 950 }, { minQty: 30, unitPrice: 850 }]) }], featuredRank: 10, relatedIds: ["p-008"],
    attributes: { material: "metal", color: "green", dimensions: "45 × 50 × 80 cm" }, inventory: { tracked: true, onHand: 80, lowStockThreshold: 10, manualAvailability: "in_stock" },
  }),
  base("p-010", "table-basse", "TAB-BAS", L("Table basse sur commande", "Ti tab sou kòmand"), L("Fabriquée sur commande : le stock n'est pas suivi.", "Fabrike sou kòmand: pa gen swivi stòk."), "furniture", {
    prices: [{ retail: htg(3800), wholesale: off }], featuredRank: 14, attributes: { material: "wood", color: "brown", shape: "rect" },
    inventory: { tracked: false, onHand: 0, manualAvailability: "preorder" },
  }),
  base("p-011", "seau-pack", "SEA-P6", L("Seau plastique 20 L (pack de 6)", "Bokit plastik 20 L (pake 6)"), L("Pack de six seaux de 20 litres.", "Pake sis bokit 20 lit."), "household", {
    unit: "pack", unitNote: L("6 seaux par pack", "6 bokit nan yon pake"), prices: [{ retail: htg(1500), wholesale: wh([{ minQty: 5, unitPrice: 1350 }]) }], featuredRank: 7,
    attributes: { material: "plastic", capacity: "20 L" }, inventory: { tracked: true, onHand: 0, lowStockThreshold: 3, manualAvailability: "in_stock" },
  }),
  base("p-012", "corde-nylon", "COR-NYL", L("Corde en nylon 8 mm", "Kòd nylon 8 mm"), L("Corde en nylon vendue au mètre (minimum 5 m).", "Kòd nylon yo vann pa mèt (minimòm 5 m)."), "general", {
    unit: "meter", prices: [{ retail: htg(35), wholesale: wh([{ minQty: 50, unitPrice: 30 }, { minQty: 200, unitPrice: 26 }]), minOrderQty: 5 }], featuredRank: 12,
    inventory: { tracked: true, onHand: 420, lowStockThreshold: 50, manualAvailability: "in_stock" },
  }),
  base("p-013", "boite-vis", "VIS-200", L("Boîte de vis à bois (200 pièces)", "Bwat vis pou bwa (200 moso)"), L("Boîte de 200 vis à bois.", "Bwat 200 vis pou bwa."), "general", {
    unit: "box", unitNote: L("200 pièces par boîte", "200 moso nan yon bwat"), prices: [{ retail: htg(650), wholesale: wh([{ minQty: 10, unitPrice: 575 }]) }], featuredRank: 13, inventory: { tracked: true, onHand: 60, lowStockThreshold: 10, manualAvailability: "in_stock" },
  }),
  base("p-014", "casserole-set", "CAS-SET", L("Set de casseroles en inox", "Seri chodyè an inoks"), L("Set de casseroles avec couvercles, en promotion.", "Seri chodyè ak kouvèti, an pwomosyon."), "household", {
    unit: "set", prices: [{ retail: htg(3200), sale: htg(2800), wholesale: off }], featuredRank: 4, attributes: { material: "steel", capacity: "3 casseroles" }, inventory: { tracked: true, onHand: 18, lowStockThreshold: 4, manualAvailability: "in_stock" },
  }),
  // A draft the seller has not finished (no price yet) and an inactive product.
  base("p-015", "etagere-bois", "", L("Étagère en bois", "Etajè an bwa"), L("", ""), "furniture", { status: "draft", prices: [], images: [], featuredRank: 90, inventory: { tracked: true, onHand: 0, manualAvailability: "in_stock" } }),
  base("p-016", "tabouret-bois", "TAB-TBR", L("Tabouret en bois", "Tabouret an bwa"), L("Tabouret retiré de la vente.", "Tabouret yo retire nan vant."), "furniture", { status: "inactive", prices: [{ retail: htg(700), wholesale: off }], featuredRank: 91, attributes: { material: "wood", color: "brown" }, inventory: { tracked: true, onHand: 7, manualAvailability: "in_stock" } }),
];

/** Opening balances plus a few later movements so the history screens have something real-looking to show. */
export function seedMovements(): StockMovement[] {
  const out: StockMovement[] = [];
  let n = 0;
  const push = (productId: string, variantId: string | undefined, final: number, extra: { delta: number; type: StockMovement["type"]; reason: StockMovement["reason"]; at: string; note?: string }[]) => {
    const sum = extra.reduce((s, e) => s + e.delta, 0);
    let bal = final - sum;
    out.push({ id: `mv-${++n}`, productId, variantId, type: "initial", delta: bal, balanceAfter: bal, reason: "reception", at: D, by: SEED_STAFF });
    for (const e of extra) { bal += e.delta; out.push({ id: `mv-${++n}`, productId, variantId, type: e.type, delta: e.delta, balanceAfter: bal, reason: e.reason, note: e.note, at: e.at, by: SEED_STAFF }); }
  };
  for (const p of seedProducts) {
    if (!p.inventory.tracked) continue;
    if (p.variants.length) for (const v of p.variants) push(p.id, v.id, v.onHand, v.onHand > 4 && p.id === "p-001" ? [{ delta: 20, type: "add", reason: "reception", at: "2026-10-20T10:00:00Z", note: "Livraison fournisseur (exemple)" }] : []);
    else if (p.inventory.onHand > 0) push(p.id, undefined, p.inventory.onHand, p.id === "p-009" ? [{ delta: -4, type: "reduce", reason: "damage", at: "2026-10-28T15:00:00Z", note: "Pieds cassés (exemple)" }] : []);
  }
  return out;
}

