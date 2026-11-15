import { beforeEach, describe, expect, it } from "vitest";
import { samplePickupSettings } from "../mock/pickup";
import { sampleReservations } from "../mock/reservations";
import { pickupStore } from "../stores/pickup-store";
import { reservationStore } from "../stores/reservation-store";
import { runReservationAction, savePickupSettings, submitReservation, resetDemoData, lookupReservation } from "./reservations";
import type { ReservationLine } from "../reservations/types";

const line: ReservationLine = { productId: "p-009", slug: "chaise-empilable", name: "Chaises", quantity: 2, unitPrice: { amount: 110000, currency: "HTG" }, image: { src: "/x.svg", alt: "" } };
const customer = { firstName: "Test", lastName: "Client", dialCode: "+509", phone: "0000 1111" };
const submit = (over = {}) => submitReservation({ lines: [line], customer, locale: "ht", acknowledgedTerms: true, ...over });

beforeEach(() => resetDemoData());

describe("submitReservation", () => {
  it("creates a pending, unpaid reservation with a snapshot of the current pickup settings", async () => {
    const res = await submit();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const r = reservationStore.getSnapshot().find((x) => x.reference === res.data.reference)!;
    expect(r.status).toBe("pending_review");
    expect(r.payment.status).toBe("unpaid");
    expect(r.totals).toEqual([{ amount: 220000, currency: "HTG" }]);
    expect(r.locale).toBe("ht");
    expect(r.pickup.location.addressLine).toBe(samplePickupSettings.location.addressLine);
    expect(r.events.map((e) => e.type)).toEqual(["submitted"]);
  });

  it("changing the global pickup address affects NEW reservations only", async () => {
    const before = await submit();
    if (!before.ok) throw new Error("setup");
    const next = structuredClone(pickupStore.getSnapshot().settings);
    next.location.addressLine = "77, avenue Nouvelle (exemple)";
    const saved = await savePickupSettings(next, "Admin Test");
    expect(saved.ok && saved.data?.changed).toContain("address");

    const after = await submit();
    if (!after.ok) throw new Error("setup");
    const all = reservationStore.getSnapshot();
    expect(all.find((r) => r.reference === before.data.reference)!.pickup.location.addressLine).toBe(samplePickupSettings.location.addressLine);
    expect(all.find((r) => r.reference === after.data.reference)!.pickup.location.addressLine).toBe("77, avenue Nouvelle (exemple)");
    // seeded reservations are untouched too
    const seeded = sampleReservations.find((r) => r.reference === "ANA-READY1")!;
    expect(all.find((r) => r.reference === "ANA-READY1")!.pickup.location.addressLine).toBe(seeded.pickup.location.addressLine);
    // and the change is audited
    expect(pickupStore.getSnapshot().history[0]).toMatchObject({ by: "Admin Test", changed: ["address"] });
  });

  it("refuses to create reservations when pickup is disabled or not configured", async () => {
    const off = { ...structuredClone(pickupStore.getSnapshot().settings), enabled: false };
    expect((await savePickupSettings(off, "A")).ok).toBe(true);
    expect(await submit()).toEqual({ ok: false, error: "pickup_disabled" });
    pickupStore.set((s) => ({ ...s, settings: { ...s.settings, enabled: true, location: { ...s.settings.location, addressLine: "" } } }));
    expect(await submit()).toEqual({ ok: false, error: "pickup_not_configured" });
  });

  it("validates cart, terms and contact", async () => {
    expect(await submit({ lines: [] })).toEqual({ ok: false, error: "cart_empty" });
    expect(await submit({ acknowledgedTerms: false })).toEqual({ ok: false, error: "terms_not_accepted" });
    expect(await submit({ customer: { ...customer, phone: "12" } })).toEqual({ ok: false, error: "contact_invalid" });
  });
});

describe("lookup and actions", () => {
  it("returns the same error for a wrong phone and an unknown reference (no enumeration)", async () => {
    const wrongPhone = await lookupReservation("ANA-PEND01", "0000 9999");
    const unknown = await lookupReservation("ANA-NOPE22", "0000 0101");
    expect(wrongPhone).toEqual({ ok: false, error: "verification_failed" });
    expect(unknown).toEqual(wrongPhone);
    const good = await lookupReservation("ana-pend01", "0000 0101");
    expect(good.ok).toBe(true);
    if (good.ok) expect(JSON.stringify(good.data)).not.toContain("internalNote");
  });
  it("applies workflow rules through the service and persists accepted changes", async () => {
    const bad = await runReservationAction("res-1", { type: "markReady", pickupConfirmed: true }, { kind: "staff", name: "A" });
    expect(bad).toEqual({ ok: false, error: "invalid_status" });
    const good = await runReservationAction("res-1", { type: "accept", customerNote: "ok" }, { kind: "staff", name: "A" });
    expect(good.ok).toBe(true);
    expect(reservationStore.getSnapshot().find((r) => r.id === "res-1")?.status).toBe("confirmed");
    expect(await runReservationAction("nope", { type: "accept" }, { kind: "staff", name: "A" })).toEqual({ ok: false, error: "not_found" });
  });
});
