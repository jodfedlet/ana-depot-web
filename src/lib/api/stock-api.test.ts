import { beforeEach, describe, expect, it } from "vitest";
import { catalogStore } from "../stores/catalog-store";
import { reservationStore } from "../stores/reservation-store";
import { stockOf } from "../catalog/stock";
import { hasVariantsRecord } from "../catalog/model";
import { adjustStock, saveCategory, saveProduct, setProductStatus } from "./catalog-admin";
import { resetDemoData, runReservationAction, submitReservation } from "./reservations";
import { emptyDraft } from "../catalog/draft";
import type { ReservationLine } from "../reservations/types";

const customer = { firstName: "Test", lastName: "Client", dialCode: "+509", phone: "0000 1111" };
const product = (id: string) => catalogStore.getSnapshot().products.find((p) => p.id === id)!;
const lineFor = (id: string, quantity: number, variantId?: string): ReservationLine => ({ productId: id, variantId, slug: product(id).slug, name: product(id).sku, quantity, unitPrice: { amount: 100, currency: "HTG" }, image: { src: "/x.svg", alt: "" } });
const submit = (lines: ReservationLine[]) => submitReservation({ lines, customer, locale: "fr", acknowledgedTerms: true });
const staff = { kind: "staff", name: "Test" } as const;

beforeEach(() => resetDemoData());

describe("reservation service enforces stock", () => {
  it("refuses more than the available quantity and accepts exactly the available quantity", async () => {
    const available = stockOf(product("p-009"), reservationStore.getSnapshot()).available;
    expect(await submit([lineFor("p-009", available + 1)])).toMatchObject({ ok: false, error: "insufficient_stock" });
    expect((await submit([lineFor("p-009", available)])).ok).toBe(true);
    // The new reservation now counts as reserved: nothing is left for a second customer.
    expect(stockOf(product("p-009"), reservationStore.getSnapshot()).available).toBe(0);
    expect(await submit([lineFor("p-009", 1)])).toMatchObject({ ok: false, error: "insufficient_stock" });
  });

  it("checks stock per variant", async () => {
    const p = product("p-006");
    expect(hasVariantsRecord(p)).toBe(true);
    const low = p.variants.reduce((a, b) => (stockOf(p, reservationStore.getSnapshot(), a.id).available <= stockOf(p, reservationStore.getSnapshot(), b.id).available ? a : b));
    const avail = stockOf(p, reservationStore.getSnapshot(), low.id).available;
    expect(await submit([lineFor("p-006", avail + 1, low.id)])).toMatchObject({ ok: false, error: "insufficient_stock" });
  });

  it("refuses inactive, draft and out-of-stock products", async () => {
    expect(await submit([lineFor("p-016", 1)])).toMatchObject({ ok: false, error: "product_unavailable" }); // inactive
    expect(await submit([lineFor("p-015", 1)])).toMatchObject({ ok: false, error: "product_unavailable" }); // draft
    expect(await submit([lineFor("p-011", 1)])).toMatchObject({ ok: false, error: "insufficient_stock" }); // tracked, 0 on hand
  });

  it("refuses quantities below the product's minimum order", async () => {
    const p = product("p-002");
    expect(p.pricing.minOrderQty).toBeGreaterThan(1);
    expect(await submit([lineFor("p-002", p.pricing.minOrderQty! - 1, p.variants[0]?.id)])).toMatchObject({ ok: false, error: "below_minimum" });
  });

  it("collecting a reservation deducts physical stock once, with a traceable movement", async () => {
    const r = reservationStore.getSnapshot().find((x) => x.reference === "ANA-READY1")!;
    const l = r.lines[0];
    const p = () => product(l.productId);
    const before = p().variants.find((v) => v.id === l.variantId)!.onHand;
    const paid = await runReservationAction(r.id, { type: "recordPayment", amount: r.totals[0].amount, currency: r.totals[0].currency, receivedAt: new Date().toISOString() }, staff);
    expect(paid.ok).toBe(true);
    expect((await runReservationAction(r.id, { type: "collect", handoverConfirmed: true }, staff)).ok).toBe(true);
    expect(p().variants.find((v) => v.id === l.variantId)!.onHand).toBe(before - l.quantity);
    const mv = catalogStore.getSnapshot().movements.filter((m) => m.note === r.reference);
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ type: "sale", delta: -l.quantity, productId: l.productId });
    // A second collect is refused by the workflow, so stock cannot be deducted twice.
    expect((await runReservationAction(r.id, { type: "collect", handoverConfirmed: true }, staff)).ok).toBe(false);
    expect(catalogStore.getSnapshot().movements.filter((m) => m.note === r.reference)).toHaveLength(1);
  });
});

describe("inventory adjustments", () => {
  it("adds, reduces and recounts with a movement for each, never touching reserved stock", async () => {
    const reservedBefore = stockOf(product("p-009"), reservationStore.getSnapshot()).reserved;
    const base = product("p-009").inventory.onHand;
    const add = await adjustStock({ productId: "p-009", type: "add", quantity: 5, reason: "reception" }, "Test");
    expect(add).toMatchObject({ ok: true, data: { delta: 5, balanceAfter: base + 5 } });
    expect(await adjustStock({ productId: "p-009", type: "reduce", quantity: 2, reason: "damage", note: " cassée " }, "Test")).toMatchObject({ ok: true, data: { balanceAfter: base + 3, note: "cassée" } });
    expect(await adjustStock({ productId: "p-009", type: "recount", quantity: 10, reason: "count" }, "Test")).toMatchObject({ ok: true, data: { delta: 10 - (base + 3), balanceAfter: 10 } });
    expect(product("p-009").inventory.onHand).toBe(10);
    expect(stockOf(product("p-009"), reservationStore.getSnapshot()).reserved).toBe(reservedBefore);
  });

  it("rejects negative results, invalid quantities and untracked products", async () => {
    expect(await adjustStock({ productId: "p-009", type: "reduce", quantity: 10_000, reason: "loss" }, "T")).toEqual({ ok: false, error: "stock_negative" });
    expect(await adjustStock({ productId: "p-009", type: "add", quantity: 0, reason: "reception" }, "T")).toEqual({ ok: false, error: "stock_invalid" });
    expect(await adjustStock({ productId: "p-009", type: "add", quantity: 1.5, reason: "reception" }, "T")).toEqual({ ok: false, error: "stock_invalid" });
    expect(await adjustStock({ productId: "p-010", type: "add", quantity: 1, reason: "reception" }, "T")).toEqual({ ok: false, error: "not_found" }); // untracked
    expect(await adjustStock({ productId: "nope", type: "add", quantity: 1, reason: "reception" }, "T")).toEqual({ ok: false, error: "not_found" });
  });
});

describe("catalog administration", () => {
  it("saves a draft without publishing; activation re-validates and then shows it to customers", async () => {
    const category = catalogStore.getSnapshot().categories.find((c) => c.slug === "general")!;
    const draft = { ...emptyDraft(), categorySlug: category.slug, nameFr: "Article test", sku: "", retail: "" };
    const saved = await saveProduct(draft, "draft", "Test");
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(product(saved.data.id).status).toBe("draft");
    expect(await setProductStatus(saved.data.id, "active")).toMatchObject({ ok: false, error: "validation" });
    expect(await saveProduct({ ...draft, id: saved.data.id, sku: "TST-1", retail: "500" }, "active", "Test")).toMatchObject({ ok: true });
    expect(product(saved.data.id).status).toBe("active");
    expect(await setProductStatus(saved.data.id, "inactive")).toMatchObject({ ok: true });
    expect(await submit([{ ...lineFor("p-009", 1), productId: saved.data.id }])).toMatchObject({ ok: false, error: "product_unavailable" });
  });

  it("refuses a duplicate SKU and a select attribute without options", async () => {
    const dup = await saveProduct({ ...emptyDraft(), categorySlug: "general", nameFr: "Doublon", sku: product("p-009").sku, retail: "100" }, "active", "Test");
    expect(dup).toMatchObject({ ok: false, error: "validation" });
    const cat = { ...catalogStore.getSnapshot().categories[0], slug: "peinture", attributes: [{ id: "a1", key: "finish", label: { fr: "Finition", ht: "Fini" }, type: "select" as const, options: [], required: false, filterable: false, variantAxis: false }] };
    expect(await saveCategory({ ...cat, name: { fr: "Peinture", ht: "Penti" } }, true)).toMatchObject({ ok: false });
  });
});
