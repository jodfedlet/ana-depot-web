import { describe, expect, it } from "vitest";
import { sampleLocation, sampleInstructions } from "../mock/pickup";
import { sampleReservations } from "../mock/reservations";
import type { Actor, Reservation } from "./types";
import { type Action, type ActionContext, allowedStaffActions, applyAction, customerCanCancel, isOverdue } from "./workflow";

const staff: Actor = { kind: "staff", name: "Staff Test" };
const ctx = (over: Partial<ActionContext> = {}): ActionContext => ({ now: "2026-11-15T10:00:00.000Z", actor: staff, holdPeriodDays: null, ...over });
const sample = (ref: string): Reservation => structuredClone(sampleReservations.find((r) => r.reference === ref)!);
const ok = (r: Reservation, a: Action, c = ctx()) => {
  const res = applyAction(r, a, c);
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);
  return res.reservation;
};
const err = (r: Reservation, a: Action, c = ctx()) => {
  const res = applyAction(r, a, c);
  if (res.ok) throw new Error("expected failure");
  return res.error;
};

describe("reservation lifecycle", () => {
  it("runs the full happy path: accept → ready → pay → collect", () => {
    let r = sample("ANA-PEND01");
    expect(r.status).toBe("pending_review");
    r = ok(r, { type: "accept", customerNote: "ok", internalNote: "internal" });
    expect(r.status).toBe("confirmed");
    r = ok(r, { type: "markReady", pickupConfirmed: true });
    expect(r.status).toBe("ready_for_pickup");
    // PEND01 mixes HTG and USD products: each currency has its own balance and is paid in its own currency.
    expect(r.totals.map((t) => t.currency)).toEqual(["HTG", "USD"]);
    r = ok(r, { type: "recordPayment", amount: r.totals[0].amount, currency: "HTG", receivedAt: "2026-11-15T10:00:00.000Z" });
    expect(r.payment.status).toBe("partial"); // USD still owed
    expect(err(r, { type: "collect", handoverConfirmed: true })).toBe("payment_required");
    r = ok(r, { type: "recordPayment", amount: r.totals[1].amount, currency: "USD", receivedAt: "2026-11-15T10:00:00.000Z" });
    expect(r.payment.status).toBe("paid");
    r = ok(r, { type: "collect", handoverConfirmed: true });
    expect(r.status).toBe("collected");
    expect(r.events.map((e) => e.type)).toEqual(["submitted", "accepted", "ready_for_pickup", "payment_recorded", "payment_recorded", "collected"]);
    expect(r.events.at(-1)?.actor).toEqual(staff); // responsible staff member recorded
  });

  it("accepting never marks a reservation ready or paid", () => {
    const r = ok(sample("ANA-PEND01"), { type: "accept" });
    expect(r.status).toBe("confirmed");
    expect(r.payment.status).toBe("unpaid");
    expect(r.readyAt).toBeUndefined();
  });

  it("cannot skip steps", () => {
    const pending = sample("ANA-PEND01");
    expect(err(pending, { type: "markReady", pickupConfirmed: true })).toBe("invalid_status");
    expect(err(pending, { type: "collect", handoverConfirmed: true })).toBe("invalid_status");
    expect(err(pending, { type: "recordPayment", amount: 100, currency: "HTG", receivedAt: "x" })).toBe("invalid_status");
    expect(err(sample("ANA-CONF01"), { type: "accept" })).toBe("invalid_status");
  });

  it("requires explicit pickup confirmation to mark ready", () => {
    expect(err(sample("ANA-CONF01"), { type: "markReady", pickupConfirmed: false })).toBe("pickup_not_confirmed");
  });
});

describe("rejection", () => {
  it("requires a reason; 'other' also needs a customer explanation; history is kept", () => {
    const r = sample("ANA-PEND01");
    expect(err(r, { type: "reject", reason: "other" })).toBe("explanation_required");
    const rejected = ok(r, { type: "reject", reason: "other", customerNote: "Explication", internalNote: "interne" });
    expect(rejected.status).toBe("rejected");
    expect(rejected.events.at(-1)?.detail?.rejectReason).toBe("other");
    expect(rejected.events).toHaveLength(r.events.length + 1);
    expect(ok(r, { type: "reject", reason: "product_unavailable" }).status).toBe("rejected");
  });
  it("only pending reservations can be rejected", () => {
    expect(err(sample("ANA-CONF01"), { type: "reject", reason: "product_unavailable" })).toBe("invalid_status");
  });
});

describe("payment and collection", () => {
  it("only records payment once ready, never automatically", () => {
    expect(err(sample("ANA-CONF01"), { type: "recordPayment", amount: 100, currency: "HTG", receivedAt: "x" })).toBe("invalid_status");
    expect(sample("ANA-READY1").payment.status).toBe("unpaid");
  });
  it("tracks partial then full payment", () => {
    let r = sample("ANA-READY1");
    expect(err(r, { type: "recordPayment", amount: 0, currency: "HTG", receivedAt: "x" })).toBe("amount_invalid");
    expect(err(r, { type: "recordPayment", amount: 1.5, currency: "HTG", receivedAt: "x" })).toBe("amount_invalid");
    r = ok(r, { type: "recordPayment", amount: 100, currency: "HTG", receivedAt: "x", reference: "REC-1" });
    expect(r.payment.status).toBe("partial");
    expect(err(r, { type: "collect", handoverConfirmed: true })).toBe("payment_required");
    r = ok(r, { type: "recordPayment", amount: r.totals[0].amount - 100, currency: "HTG", receivedAt: "x" });
    expect(r.payment.status).toBe("paid");
    expect(r.payment.records).toHaveLength(2);
    expect(err(r, { type: "recordPayment", amount: 1, currency: "HTG", receivedAt: "x" })).toBe("already_paid");
  });
  it("collection needs payment AND confirmed handover", () => {
    let r = sample("ANA-READY1");
    expect(err(r, { type: "collect", handoverConfirmed: true })).toBe("payment_required");
    r = ok(r, { type: "recordPayment", amount: r.totals[0].amount, currency: r.totals[0].currency, receivedAt: "x" });
    expect(err(r, { type: "collect", handoverConfirmed: false })).toBe("handover_not_confirmed");
  });
});

describe("cancellation and expiry", () => {
  it("staff cancellation needs a reason, and an operational check once the customer was promised something", () => {
    expect(err(sample("ANA-PEND01"), { type: "cancel", reason: " " })).toBe("reason_required");
    expect(ok(sample("ANA-PEND01"), { type: "cancel", reason: "Doublon" }).status).toBe("cancelled");
    expect(err(sample("ANA-CONF01"), { type: "cancel", reason: "x" })).toBe("operational_check_required");
    const c = ok(sample("ANA-READY1"), { type: "cancel", reason: "x", operationalCheck: true });
    expect(c.events.at(-1)?.detail).toMatchObject({ cancelledBy: "staff", cancelReason: "x" });
  });
  it("distinguishes customer cancellation and limits it to unpaid open reservations", () => {
    const customer: Actor = { kind: "customer" };
    const r = ok(sample("ANA-PEND01"), { type: "cancel", reason: "Plus besoin" }, ctx({ actor: customer }));
    expect(r.events.at(-1)?.detail?.cancelledBy).toBe("customer");
    expect(err(sample("ANA-COLL01"), { type: "cancel", reason: "x" }, ctx({ actor: customer }))).toBe("invalid_status");
    expect(err(sample("ANA-PEND01"), { type: "cancel", reason: "" }, ctx({ actor: customer }))).toBe("reason_required");
    const paid = ok(sample("ANA-READY1"), { type: "recordPayment", amount: sample("ANA-READY1").totals[0].amount, currency: "HTG", receivedAt: "x" });
    expect(customerCanCancel(paid)).toBe(false);
  });
  it("customers cannot perform staff actions", () => {
    expect(err(sample("ANA-PEND01"), { type: "accept" }, ctx({ actor: { kind: "customer" } }))).toBe("staff_required");
  });
  it("sets an expiry date only when a hold period is configured (no hardcoded default)", () => {
    expect(ok(sample("ANA-CONF01"), { type: "markReady", pickupConfirmed: true }).expiresAt).toBeUndefined();
    const withPolicy = ok(sample("ANA-CONF01"), { type: "markReady", pickupConfirmed: true }, ctx({ holdPeriodDays: 3 }));
    expect(withPolicy.expiresAt).toBe("2026-11-18T10:00:00.000Z");
    expect(isOverdue(withPolicy, "2026-11-19T00:00:00.000Z")).toBe(true);
    expect(isOverdue(withPolicy, "2026-11-16T00:00:00.000Z")).toBe(false);
  });
  it("lets the system expire a ready reservation", () => {
    expect(ok(sample("ANA-READY1"), { type: "expire" }, ctx({ actor: { kind: "system" } })).status).toBe("expired");
  });
});

describe("notes and allowed actions", () => {
  it("adds customer-visible and internal notes separately; empty notes are rejected", () => {
    let r = ok(sample("ANA-CONF01"), { type: "addNote", visibility: "customer", text: "Bonjour" });
    r = ok(r, { type: "addNote", visibility: "internal", text: "secret" });
    expect(r.events.at(-2)).toMatchObject({ customerNote: "Bonjour" });
    expect(r.events.at(-2)?.internalNote).toBeUndefined();
    expect(r.events.at(-1)).toMatchObject({ internalNote: "secret" });
    expect(r.events.at(-1)?.customerNote).toBeUndefined();
    expect(err(r, { type: "addNote", visibility: "internal", text: "  " })).toBe("note_empty");
  });
  it("exposes exactly the actions valid for each status", () => {
    expect(allowedStaffActions(sample("ANA-PEND01"))).toContain("accept");
    expect(allowedStaffActions(sample("ANA-PEND01"))).not.toContain("markReady");
    expect(allowedStaffActions(sample("ANA-READY1"))).toEqual(expect.arrayContaining(["recordPayment", "collect"]));
    expect(allowedStaffActions(sample("ANA-COLL01"))).toEqual(["addNote"]);
  });
});

describe("pickup location per reservation", () => {
  it("changing one reservation's pickup records from/to and does not touch others", () => {
    const a = sample("ANA-READY1");
    const b = sample("ANA-READY2");
    const bBefore = JSON.stringify(b);
    const changed = ok(a, {
      type: "changePickup",
      to: { location: { ...sampleLocation, addressLine: "99, rue Nouvelle (exemple)" }, instructions: sampleInstructions, capturedAt: "x", origin: "override" },
      customerNote: "Nouvelle adresse",
    });
    expect(changed.pickup.location.addressLine).toBe("99, rue Nouvelle (exemple)");
    expect(changed.pickup.origin).toBe("override");
    const e = changed.events.at(-1)!;
    expect(e.type).toBe("pickup_changed");
    expect(e.detail?.fromPickup?.addressLine).toBe(a.pickup.location.addressLine);
    expect(e.detail?.toPickup?.addressLine).toBe("99, rue Nouvelle (exemple)");
    expect(JSON.stringify(b)).toBe(bBefore);
  });
  it("rejects an incomplete location and blocks changes on finished reservations", () => {
    const base = { location: { ...sampleLocation, addressLine: "" }, instructions: sampleInstructions, capturedAt: "x", origin: "override" as const };
    expect(err(sample("ANA-READY1"), { type: "changePickup", to: base })).toBe("pickup_invalid");
    expect(err(sample("ANA-COLL01"), { type: "changePickup", to: { ...base, location: sampleLocation } })).toBe("invalid_status");
  });
});
