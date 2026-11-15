import { beforeEach, describe, expect, it } from "vitest";
import { buildCartLine, cartReducer, cartSubtotals, lineTotal } from "./cart";
import { type ProductDraft, draftToRecord, emptyDraft, recordToDraft, validateDraft } from "./catalog/draft";
import { toProduct } from "./catalog/localize";
import { snapshotFor, unitPriceFor, validatePricing } from "./catalog/pricing";
import { seedCategories, seedProducts } from "./mock/catalog-seed";
import { catalogStore } from "./stores/catalog-store";
import { reservationStore } from "./stores/reservation-store";
import { balances, computeTotals, paidTotals, paymentStatusOf } from "./reservations/workflow";
import { type Reservation, reservationLineTotal } from "./reservations/types";
import { resetDemoData, runReservationAction, submitReservation } from "./api/reservations";
import { saveProduct } from "./api/catalog-admin";
import { sampleReservations } from "./mock/reservations";
import { sumByCurrency } from "./money";

const rec = (slug: string) => seedProducts.find((p) => p.slug === slug)!;
const category = (slug: string) => seedCategories.find((c) => c.slug === slug)!;
const display = (slug: string) => toProduct(rec(slug), category(rec(slug).categorySlug), "fr", []);
const staff = { kind: "staff", name: "Test" } as const;

describe("every product has an explicit currency", () => {
  it("seed products are HTG or USD, and the sample catalog covers both", () => {
    const currencies = new Set(seedProducts.map((p) => p.pricing.currency));
    expect(currencies).toEqual(new Set(["HTG", "USD"]));
    for (const p of seedProducts) expect(["HTG", "USD"]).toContain(p.pricing.currency);
  });
  it("the customer-facing product carries the currency on price, compare-at price and variant prices", () => {
    const shoes = display("baskets-sport"); // USD
    expect(shoes.price.currency).toBe("USD");
    const sheets = display("drap-coton-set"); // USD with a variant priced on its own
    expect(sheets.variants.find((v) => v.price)?.price?.currency).toBe("USD");
    const pot = display("casserole-set"); // HTG with a sale price
    expect(pot.price.currency).toBe("HTG");
    expect(pot.compareAtPrice?.currency).toBe("HTG");
    expect(pot.price.amount).toBeLessThan(pot.compareAtPrice!.amount);
  });
});

describe("creating and editing products in either currency", () => {
  const base = (currency: "HTG" | "USD", over: Partial<ProductDraft> = {}): ProductDraft => ({
    ...emptyDraft("general"), nameFr: "Article", sku: `T-${currency}`, currency, retail: "25.50", sale: "20", minOrderQty: "2",
    wholesaleEnabled: true, tiers: [{ minQty: "10", unitPrice: "18.75" }, { minQty: "50", unitPrice: "15" }], ...over,
  });
  const general = category("general");

  for (const currency of ["HTG", "USD"] as const) {
    it(`${currency}: validates, saves and round-trips retail, sale and wholesale tiers in ${currency}`, () => {
      const d = base(currency);
      expect(validateDraft(d, general, [], "publish")).toEqual({});
      const r = draftToRecord(d, { id: "x", slug: "x", now: "2026-11-15T10:00:00Z" });
      expect(r.pricing).toMatchObject({ currency, retail: 2550, sale: 2000, minOrderQty: 2, wholesale: { enabled: true, tiers: [{ minQty: 10, unitPrice: 1875 }, { minQty: 50, unitPrice: 1500 }] } });
      const again = recordToDraft(r);
      expect(again).toMatchObject({ currency, retail: "25.5", sale: "20" });
      expect(again.tiers.map((t) => t.unitPrice)).toEqual(["18.75", "15"]);
      // editing a price keeps the currency
      const edited = draftToRecord({ ...again, retail: "30" }, { id: "x", slug: "x", now: "2026-11-16T10:00:00Z" });
      expect(edited.pricing.currency).toBe(currency);
      expect(edited.pricing.retail).toBe(3000);
    });
  }

  it("rejects an unsupported currency and keeps sale/tier rules independent of the currency", () => {
    expect(validateDraft({ ...base("USD"), currency: "EUR" as never }, general, [], "publish").currency).toBe("currencyInvalid");
    expect(validateDraft(base("USD", { sale: "30" }), general, [], "publish").sale).toBe("saleInvalid");
    expect(validateDraft(base("HTG", { tiers: [{ minQty: "10", unitPrice: "30" }] }), general, [], "publish")["tier.0.tierAboveBase"]).toBe("tierAboveBase");
  });

  it("variant prices are entered in the product currency and tiers scale proportionally for each currency", () => {
    for (const [slug, currency] of [["tube-rond-galva", "HTG"], ["drap-coton-set", "USD"]] as const) {
      const r = rec(slug);
      const priced = r.variants.find((v) => v.price !== undefined)!;
      const snap = snapshotFor(r.pricing, priced.price);
      expect(snap.currency).toBe(currency);
      const tier = r.pricing.wholesale.tiers[0];
      expect(snap.tiers[0].unitPrice).toBe(Math.round(tier.unitPrice * (priced.price! / r.pricing.retail)));
      // round-trip through the editor keeps the variant price and the product currency
      expect(recordToDraft(r).variants.find((v) => v.id === priced.id)?.price).toBe(String(priced.price! / 100));
      expect(draftToRecord(recordToDraft(r), { id: r.id, slug: r.slug, now: "x" }).pricing.currency).toBe(currency);
    }
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

  it("saves a USD product through the admin API and it appears to customers in USD", async () => {
    resetDemoData();
    const saved = await saveProduct(base("USD", { sku: "USD-1", tiers: [{ minQty: "10", unitPrice: "18" }] }), "active", "Test");
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const stored = catalogStore.getSnapshot().products.find((p) => p.id === saved.data.id)!;
    expect(stored.pricing.currency).toBe("USD");
    expect(toProduct(stored, general, "ht", []).price).toEqual({ amount: 2000, currency: "USD" });
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
const submit = (lines: ReturnType<typeof line>[]) => submitReservation({ lines, customer, locale: "fr", acknowledgedTerms: true });

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

  it("stores the applied wholesale tier and price, and later price changes do not alter the reservation", async () => {
    const res = await submit([line("baskets-sport", 12, 0)]); // USD tier: 12+ pairs
    if (!res.ok) throw new Error(res.error);
    const before = structuredClone(reservationStore.getSnapshot().find((x) => x.reference === res.data.reference)!);
    expect(before.lines[0]).toMatchObject({ priceKind: "wholesale", tierMinQty: 12, unitPrice: { amount: 2300, currency: "USD" }, quantity: 12 });
    expect(before.totals).toEqual([{ amount: 27600, currency: "USD" }]);
    // the seller changes the product's price and currency afterwards
    catalogStore.set((s) => ({ ...s, products: s.products.map((p) => (p.slug === "baskets-sport" ? { ...p, pricing: { ...p.pricing, currency: "HTG" as const, retail: 999900 } } : p)) }));
    const after = reservationStore.getSnapshot().find((x) => x.reference === res.data.reference)!;
    expect(after.lines).toEqual(before.lines);
    expect(after.totals).toEqual(before.totals);
  });

  it("refuses a line whose currency does not match the product's currency (no implicit conversion)", async () => {
    const l = line("casserole-set", 1);
    expect(await submit([{ ...l, unitPrice: { amount: l.unitPrice.amount, currency: "USD" } }])).toMatchObject({ ok: false, error: "currency_mismatch" });
  });
});

describe("payments keep their currency and balances stay per currency", () => {
  beforeEach(() => resetDemoData());
  const mixedReady = async () => {
    const res = await submit([line("casserole-set", 1), line("sandales-cuir", 2, 0)]); // 2 800 HTG + 30 USD
    if (!res.ok) throw new Error(res.error);
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
