import { beforeEach, describe, expect, it } from "vitest";
import { buildCartLine, cartReducer, cartSubtotals, lineTotal } from "./cart";
import { type DraftPrice, type ProductDraft, draftToRecord, emptyDraft, emptyDraftPrice, recordToDraft, validateDraft } from "./catalog/draft";
import { inCurrency } from "./catalog/offers";
import { toProduct } from "./catalog/localize";
import { snapshotFor, unitPriceFor, validatePricing } from "./catalog/pricing";
import { seedCategories, seedProducts } from "./mock/catalog-seed";
import { catalogStore } from "./stores/catalog-store";
import { reservationStore } from "./stores/reservation-store";
import { samplePickupSettings } from "./mock/pickup";
import { snapshotFromSettings } from "./pickup/types";
import { balances, computeTotals, paidTotals, paymentStatusOf } from "./reservations/workflow";
import { type Reservation, reservationLineTotal } from "./reservations/types";
import { resetDemoData, runReservationAction } from "./api/reservations";
import { saveProduct } from "./api/catalog-admin";
import { sampleReservations } from "./mock/reservations";
import { sumByCurrency } from "./money";

const rec = (slug: string) => seedProducts.find((p) => p.slug === slug)!;
const category = (slug: string) => seedCategories.find((c) => c.slug === slug)!;
const display = (slug: string) => toProduct(rec(slug), category(rec(slug).categorySlug), "fr", []);
const staff = { kind: "staff", name: "Test" } as const;

describe("every product has explicit per-currency prices (one product, independent price sets)", () => {
  it("seed prices are HTG and/or USD; the sample catalog covers HTG-only, USD-only and both", () => {
    const sets = seedProducts.map((p) => p.prices.map((x) => x.currency).join("+"));
    expect(sets).toContain("HTG");
    expect(sets).toContain("USD");
    expect(sets).toContain("HTG+USD");
    for (const p of seedProducts) {
      const codes = p.prices.map((x) => x.currency);
      expect(new Set(codes).size, p.slug).toBe(codes.length); // never two price sets for one currency
      for (const c of codes) expect(["HTG", "USD"]).toContain(c);
    }
  });
  it("the customer-facing product carries the currency on price, compare-at price, offers and variant prices", () => {
    const shoes = display("baskets-sport"); // USD only
    expect(shoes.price.currency).toBe("USD");
    expect(shoes.offers.map((o) => o.currency)).toEqual(["USD"]);
    const sheets = display("drap-coton-set"); // USD with a variant priced on its own
    expect(sheets.variants.find((v) => v.price)?.price?.currency).toBe("USD");
    const pot = display("casserole-set"); // HTG with a sale price
    expect(pot.price.currency).toBe("HTG");
    expect(pot.compareAtPrice?.currency).toBe("HTG");
    expect(pot.price.amount).toBeLessThan(pot.compareAtPrice!.amount);
  });
  it("ONE mattress, two independent price sets and ONE stock", () => {
    const record = rec("matelas-mousse");
    expect(seedProducts.filter((p) => p.slug === "matelas-mousse")).toHaveLength(1);
    expect(record.prices.map((x) => x.currency)).toEqual(["HTG", "USD"]);
    const [htg, usd] = record.prices;
    expect(htg.retail).toBe(450000);
    expect(usd.retail).toBe(6000);
    expect(htg.wholesale.tiers.map((t) => t.minQty)).toEqual([5, 10]);
    expect(usd.wholesale.tiers.map((t) => [t.minQty, t.unitPrice])).toEqual([[5, 5400], [10, 5000]]);
    const view = display("matelas-mousse");
    expect(view.offers.map((o) => [o.currency, o.price.amount])).toEqual([["HTG", 450000], ["USD", 6000]]);
    // each currency view prices the same variant with ITS OWN override and tiers
    const hv = inCurrency(view, "HTG")!, uv = inCurrency(view, "USD")!;
    const double = (v: typeof view) => v.variants.find((x) => x.price)!;
    expect(double(hv).price).toEqual({ amount: 680000, currency: "HTG" });
    expect(double(uv).price).toEqual({ amount: 9000, currency: "USD" });
    expect(inCurrency(view, "EUR")).toBeNull(); // a missing currency is never invented
    // stock is a single position: it does not depend on the currency view
    expect(hv.availableQty).toBe(uv.availableQty);
    expect(record.inventory).toBeDefined();
  });
  it("a product not sold in a currency is not offered in it (no conversion)", () => {
    expect(inCurrency(display("casserole-set"), "USD")).toBeNull();
    expect(inCurrency(display("baskets-sport"), "HTG")).toBeNull();
  });
});

describe("creating and editing products in either or both currencies", () => {
  const priced = (over: Partial<DraftPrice> = {}): DraftPrice => ({ ...emptyDraftPrice(true), retail: "25.50", sale: "20", minOrderQty: "2", wholesaleEnabled: true, tiers: [{ minQty: "10", unitPrice: "18.75" }, { minQty: "50", unitPrice: "15" }], ...over });
  const base = (currencies: ("HTG" | "USD")[], over: Partial<ProductDraft> = {}): ProductDraft => ({
    ...emptyDraft("general"), nameFr: "Article", sku: `T-${currencies.join("")}`,
    prices: { HTG: currencies.includes("HTG") ? priced() : emptyDraftPrice(), USD: currencies.includes("USD") ? priced() : emptyDraftPrice() }, ...over,
  });
  const general = category("general");

  for (const currency of ["HTG", "USD"] as const) {
    it(`${currency} only: validates, saves and round-trips retail, sale and wholesale tiers in ${currency}`, () => {
      const d = base([currency]);
      expect(validateDraft(d, general, [], "publish")).toEqual({});
      const r = draftToRecord(d, { id: "x", slug: "x", now: "2026-11-15T10:00:00Z" });
      expect(r.prices).toHaveLength(1);
      expect(r.prices[0]).toMatchObject({ currency, retail: 2550, sale: 2000, minOrderQty: 2, wholesale: { enabled: true, tiers: [{ minQty: 10, unitPrice: 1875 }, { minQty: 50, unitPrice: 1500 }] } });
      const again = recordToDraft(r);
      expect(again.prices[currency]).toMatchObject({ enabled: true, retail: "25.5", sale: "20" });
      expect(again.prices[currency].tiers.map((t) => t.unitPrice)).toEqual(["18.75", "15"]);
      const other = currency === "HTG" ? "USD" : "HTG";
      expect(again.prices[other].enabled).toBe(false); // the other currency is NOT generated
      const edited = draftToRecord({ ...again, prices: { ...again.prices, [currency]: { ...again.prices[currency], retail: "30" } } }, { id: "x", slug: "x", now: "2026-11-16T10:00:00Z" });
      expect(edited.prices[0].currency).toBe(currency);
      expect(edited.prices[0].retail).toBe(3000);
    });
  }

  it("HTG and USD on ONE product: independent retail, sale and tiers; editing one never touches the other", () => {
    const d = base(["HTG", "USD"], { prices: { HTG: priced({ retail: "2500", sale: "", minOrderQty: "", tiers: [{ minQty: "5", unitPrice: "2300" }] }), USD: priced({ retail: "18", sale: "", minOrderQty: "3", tiers: [{ minQty: "5", unitPrice: "16.5" }] }) } });
    expect(validateDraft(d, general, [], "publish")).toEqual({});
    const r = draftToRecord(d, { id: "x", slug: "x", now: "2026-11-15T10:00:00Z" });
    expect(r.prices.map((x) => [x.currency, x.retail, x.minOrderQty])).toEqual([["HTG", 250000, undefined], ["USD", 1800, 3]]);
    expect(r.prices[0].wholesale.tiers).toEqual([{ minQty: 5, unitPrice: 230000 }]);
    expect(r.prices[1].wholesale.tiers).toEqual([{ minQty: 5, unitPrice: 1650 }]);
    const edited = draftToRecord({ ...recordToDraft(r), prices: { ...recordToDraft(r).prices, USD: { ...recordToDraft(r).prices.USD, retail: "19" } } }, { id: "x", slug: "x", now: "later" });
    expect(edited.prices[0]).toEqual(r.prices[0]);
    expect(edited.prices[1].retail).toBe(1900);
  });

  it("validates each currency on its own, and publishing needs at least one currency", () => {
    expect(validateDraft(base([]), general, [], "publish").prices).toBe("priceRequired");
    expect(validateDraft(base(["USD"], { prices: { HTG: emptyDraftPrice(), USD: priced({ sale: "30" }) } }), general, [], "publish")["price.USD.sale"]).toBe("saleInvalid");
    const mixed = validateDraft(base(["HTG", "USD"], { prices: { HTG: priced(), USD: priced({ tiers: [{ minQty: "10", unitPrice: "30" }] }) } }), general, [], "publish");
    expect(mixed["price.USD.tier.0.tierAboveBase"]).toBe("tierAboveBase");
    expect(Object.keys(mixed).some((k) => k.startsWith("price.HTG"))).toBe(false); // the HTG set is valid and unaffected
    // a drafted currency with nothing typed is not an error until publishing
    expect(validateDraft(base(["USD"], { prices: { HTG: emptyDraftPrice(), USD: emptyDraftPrice(true) } }), general, [], "draft")).toEqual({});
  });

  it("variant prices are per currency, only for currencies the product sells in, and tiers scale proportionally in each", () => {
    for (const [slug, currency] of [["tube-rond-galva", "HTG"], ["drap-coton-set", "USD"], ["matelas-mousse", "USD"]] as const) {
      const r = rec(slug);
      const pr = r.prices.find((x) => x.currency === currency)!;
      const withOwn = r.variants.find((v) => v.prices?.[currency] !== undefined)!;
      const snap = snapshotFor(pr, withOwn.prices![currency]);
      expect(snap.currency).toBe(currency);
      expect(snap.tiers[0].unitPrice).toBe(Math.round(pr.wholesale.tiers[0].unitPrice * (withOwn.prices![currency]! / pr.retail)));
      const draft = recordToDraft(r);
      expect(draft.variants.find((v) => v.id === withOwn.id)?.prices[currency]).toBe(String(withOwn.prices![currency]! / 100));
      expect(draftToRecord(draft, { id: r.id, slug: r.slug, now: "x" }).variants.find((v) => v.id === withOwn.id)?.prices?.[currency]).toBe(withOwn.prices![currency]);
    }
    // a variant price typed for a currency that is switched off is dropped, never kept or converted
    const d = recordToDraft(rec("matelas-mousse"));
    const off = { ...d, prices: { ...d.prices, USD: { ...d.prices.USD, enabled: false } } };
    expect(draftToRecord(off, { id: "m", slug: "m", now: "x" }).variants.every((v) => v.prices?.USD === undefined)).toBe(true);
  });

  it("wholesale tiers work in USD exactly as in HTG", () => {
    const usd = { currency: "USD" as const, retail: 2800, wholesale: { enabled: true, tiers: [{ minQty: 6, unitPrice: 2500 }, { minQty: 12, unitPrice: 2300 }] } };
    expect(validatePricing({ retail: 2800, wholesaleEnabled: true, tiers: usd.wholesale.tiers })).toEqual([]);
    const s = snapshotFor(usd);
    expect(unitPriceFor(s, 5)).toMatchObject({ unitPrice: 2800, kind: "retail" });
    expect(unitPriceFor(s, 6)).toMatchObject({ unitPrice: 2500, kind: "wholesale" });
    expect(unitPriceFor(s, 12).unitPrice).toBe(2300);
    expect(s.currency).toBe("USD");
  });

  it("saves a USD-only and a two-currency product through the admin API and customers see the right offers", async () => {
    resetDemoData();
    const usdOnly = await saveProduct(base(["USD"], { sku: "USD-1", prices: { HTG: emptyDraftPrice(), USD: priced({ tiers: [{ minQty: "10", unitPrice: "18" }] }) } }), "active", "Test");
    expect(usdOnly.ok).toBe(true);
    if (!usdOnly.ok) return;
    const stored = catalogStore.getSnapshot().products.find((p) => p.id === usdOnly.data.id)!;
    expect(stored.prices.map((x) => x.currency)).toEqual(["USD"]);
    expect(toProduct(stored, general, "ht", []).price).toEqual({ amount: 2000, currency: "USD" });
    const both = await saveProduct(base(["HTG", "USD"], { sku: "BOTH-1" }), "active", "Test");
    expect(both.ok).toBe(true);
    if (!both.ok) return;
    const view = toProduct(catalogStore.getSnapshot().products.find((p) => p.id === both.data.id)!, general, "fr", []);
    expect(view.offers.map((o) => o.currency)).toEqual(["HTG", "USD"]);
  });
});

describe("cart keeps each line's currency", () => {
  it("re-pricing by quantity never changes the currency, in either currency", () => {
    for (const [slug, currency] of [["tube-rond-galva", "HTG"], ["baskets-sport", "USD"]] as const) {
      const p = display(slug);
      const v = p.variants[0];
      const line = buildCartLine(p, v, 1);
      expect(line.unitPrice.currency).toBe(currency);
      const wholesale = cartReducer([line], { type: "setQuantity", key: line.key, quantity: 60 })[0];
      expect(wholesale.priceKind).toBe("wholesale");
      expect(wholesale.unitPrice.currency).toBe(currency);
      expect(lineTotal(wholesale).currency).toBe(currency);
    }
  });
  it("a mixed cart has one subtotal per currency and no combined amount", () => {
    let lines = cartReducer([], { type: "add", line: buildCartLine(display("casserole-set"), undefined, 2) }); // HTG
    lines = cartReducer(lines, { type: "add", line: buildCartLine(display("sandales-cuir"), display("sandales-cuir").variants[0], 3) }); // USD
    const totals = cartSubtotals(lines);
    expect(totals.map((t) => t.currency)).toEqual(["HTG", "USD"]);
    expect(totals[0].amount).toBe(280000 * 2);
    expect(totals[1].amount).toBe(1500 * 3);
    expect(lines.map((l) => l.unitPrice.currency)).toEqual(["HTG", "USD"]);
  });
});

const line = (slug: string, quantity: number, variantIndex?: number) => {
  const p = display(slug);
  const l = buildCartLine(p, variantIndex === undefined ? undefined : p.variants[variantIndex], quantity);
  return { productId: l.productId, variantId: l.variantId, slug: l.slug, name: l.name, variantLabel: l.variantLabel, quantity: l.quantity, unitPrice: l.unitPrice, unit: l.unit, priceKind: l.priceKind, tierMinQty: unitPriceFor(l.pricing, l.quantity).tier?.minQty, image: l.image };
};
const customer = { firstName: "Test", lastName: "Client", dialCode: "+509", phone: "0000 1111" };
/**
 * Administration demo only: builds a pending reservation in the demo store so the PAYMENT workflow (which the admin screens still use) can be tested.
 * Customer submission itself is the API's job now (see the backend tests and api/map-reservation.test.ts).
 */
let seeded = 0;
const submit = async (lines: ReturnType<typeof line>[]) => {
  const now = "2026-11-15T09:00:00.000Z";
  const id = `res-test-${++seeded}`;
  const reference = `ANA-TEST${seeded}`;
  const r: Reservation = { id, reference, locale: "fr", createdAt: now, status: "pending_review", customer, lines, totals: computeTotals(lines), payment: { method: "cash_at_pickup", status: "unpaid", records: [] }, pickup: snapshotFromSettings(samplePickupSettings, now), events: [{ id: `${id}-e1`, type: "submitted", at: now, actor: { kind: "customer" } }] };
  reservationStore.set((prev) => [r, ...prev]);
  return { ok: true as const, data: { reference } };
};

describe("reservations snapshot price, unit, tier and currency", () => {
  beforeEach(() => resetDemoData());

  it("a mixed HTG + USD reservation keeps separate totals, and line totals in the line currency", async () => {
    const res = await submit([line("casserole-set", 2), line("sandales-cuir", 3, 0)]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = reservationStore.getSnapshot().find((x) => x.reference === res.data.reference)!;
    expect(r.totals).toEqual([{ amount: 560000, currency: "HTG" }, { amount: 4500, currency: "USD" }]);
    expect(r.lines.map(reservationLineTotal)).toEqual([{ amount: 560000, currency: "HTG" }, { amount: 4500, currency: "USD" }]);
    expect(r.lines.map((l) => l.unit)).toEqual(["set", "pair"]);
  });
});

describe("payments keep their currency and balances stay per currency", () => {
  beforeEach(() => resetDemoData());
  const mixedReady = async () => {
    const res = await submit([line("casserole-set", 1), line("sandales-cuir", 2, 0)]); // 2 800 HTG + 30 USD
    const id = reservationStore.getSnapshot().find((x) => x.reference === res.data.reference)!.id;
    await runReservationAction(id, { type: "accept" }, staff);
    await runReservationAction(id, { type: "markReady", pickupConfirmed: true }, staff);
    return id;
  };
  const get = (id: string): Reservation => reservationStore.getSnapshot().find((x) => x.id === id)!;
  const pay = (id: string, amount: number, currency: string) => runReservationAction(id, { type: "recordPayment", amount, currency, receivedAt: "2026-11-15T10:00:00.000Z" }, staff);

  it("a payment settles only its own currency", async () => {
    const id = await mixedReady();
    expect((await pay(id, 280000, "HTG")).ok).toBe(true);
    let r = get(id);
    expect(r.payment.records).toEqual([expect.objectContaining({ amount: 280000, currency: "HTG" })]);
    expect(balances(r)).toEqual([{ currency: "HTG", total: 280000, paid: 280000, due: 0 }, { currency: "USD", total: 3000, paid: 0, due: 3000 }]);
    expect(r.payment.status).toBe("partial");
    // HTG paid in full cannot be paid again, and a USD amount is never counted against HTG
    expect(await pay(id, 100, "HTG")).toEqual({ ok: false, error: "already_paid" });
    expect(await runReservationAction(id, { type: "collect", handoverConfirmed: true }, staff)).toEqual({ ok: false, error: "payment_required" });
    expect((await pay(id, 1000, "USD")).ok).toBe(true);
    r = get(id);
    expect(balances(r).find((b) => b.currency === "USD")).toMatchObject({ paid: 1000, due: 2000 });
    expect(paidTotals(r)).toEqual([{ amount: 280000, currency: "HTG" }, { amount: 1000, currency: "USD" }]);
    expect(r.payment.status).toBe("partial");
    expect((await pay(id, 2000, "USD")).ok).toBe(true);
    expect(get(id).payment.status).toBe("paid");
    expect((await runReservationAction(id, { type: "collect", handoverConfirmed: true }, staff)).ok).toBe(true);
  });

  it("refuses a payment in a currency the reservation does not contain, and large amounts in another currency never settle a balance", async () => {
    const id = await mixedReady();
    expect(await pay(id, 500, "EUR")).toEqual({ ok: false, error: "currency_invalid" });
    // 1 000 000 USD cannot pay the HTG balance: nothing is converted
    await pay(id, 1_000_000, "USD");
    expect(balances(get(id)).find((b) => b.currency === "HTG")).toMatchObject({ paid: 0, due: 280000 });
    expect(get(id).payment.status).toBe("partial");
  });

  it("payment events and records preserve amount and currency", async () => {
    const id = await mixedReady();
    await pay(id, 3000, "USD");
    const e = get(id).events.at(-1)!;
    expect(e.type).toBe("payment_recorded");
    expect(e.detail?.amount).toEqual({ amount: 3000, currency: "USD" });
  });

  it("single-currency reservations still work with one total", () => {
    const r = sampleReservations.find((x) => x.reference === "ANA-READY1")!;
    expect(r.totals).toHaveLength(1);
    expect(paymentStatusOf(r)).toBe("unpaid");
  });
});

describe("sample reservations demonstrate mixed currencies consistently", () => {
  it("every sample total equals the per-currency sum of its lines, and paid samples are settled in each currency", () => {
    for (const r of sampleReservations) {
      expect(r.totals).toEqual(sumByCurrency(r.lines.map(reservationLineTotal)));
      expect(computeTotals(r.lines)).toEqual(r.totals);
      if (r.payment.status === "paid") expect(balances(r).every((b) => b.due === 0)).toBe(true);
    }
    expect(sampleReservations.some((r) => r.totals.length > 1)).toBe(true);
    const collected = sampleReservations.find((r) => r.reference === "ANA-COLL01")!;
    expect(collected.payment.records.map((p) => p.currency).sort()).toEqual(["HTG", "USD"]);
  });
});

describe("ONE stock position shared by HTG and USD (mattress, large size: 3 units)", () => {
  beforeEach(() => resetDemoData());
  const view = display("matelas-mousse");
  const large = view.variants.find((v) => v.availableQty === 3)!;
  const inCur = (c: string) => inCurrency(view, c)!;
  it("the same item in HTG and in USD is two cart lines (two prices) whose quantities together cannot exceed the stock", () => {
    let lines = cartReducer([], { type: "add", line: buildCartLine(inCur("HTG"), inCur("HTG").variants.find((v) => v.id === large.id), 2) });
    lines = cartReducer(lines, { type: "add", line: buildCartLine(inCur("USD"), inCur("USD").variants.find((v) => v.id === large.id), 2) });
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map((l) => l.key)).size).toBe(2);
    expect(lines.map((l) => l.unitPrice)).toEqual([{ amount: 820000, currency: "HTG" }, { amount: 11000, currency: "USD" }]);
    expect(lines.map((l) => l.quantity)).toEqual([2, 1]); // only 1 of the 3 units was left for USD
    const up = cartReducer(lines, { type: "setQuantity", key: lines[1].key, quantity: 3 });
    expect(up[1].quantity).toBe(1);
    expect(cartSubtotals(up).map((t) => t.currency)).toEqual(["HTG", "USD"]);
  });
});
