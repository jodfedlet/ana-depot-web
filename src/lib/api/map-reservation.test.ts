import { describe, expect, it } from "vitest";
import { pickupAvailable, reservationView } from "./fixtures";
import type { ReservationViewDto } from "./dto";
import { toCustomerReservation, toPickupView } from "./map-reservation";

describe("toCustomerReservation (MOCKED contract fixtures, not the real server)", () => {
  const v = toCustomerReservation(reservationView)!;

  it("keeps one total, one balance and its own lines per currency; nothing is summed across currencies", () => {
    expect(v.totals).toEqual([{ amount: 5000000, currency: "HTG" }, { amount: 82500, currency: "USD" }]);
    expect(v.balances.map((b) => [b.currency, b.total.amount, b.paid.amount, b.due.amount])).toEqual([["HTG", 5000000, 0, 5000000], ["USD", 82500, 0, 82500]]);
    expect(v.lines.map((l) => [l.unitPrice.currency, l.lineTotal.amount])).toEqual([["HTG", 5000000], ["USD", 82500]]);
    expect(v.lines[1]).toMatchObject({ priceKind: "wholesale", tierMinQty: 5, unit: "unit" });
  });

  it("uses the SERVER's statuses: a submitted reservation is pending, unpaid and not expired", () => {
    expect(v).toMatchObject({ status: "pending_review", reference: "ANA-K7M2QX", canCancel: false, expiresAt: undefined });
    expect(v.payment).toEqual({ status: "unpaid", paid: [] });
    expect(v.customer).toEqual({ name: "Marie Exemple", phone: "+509 3700 0000", email: "marie@example.test" });
  });

  it("maps every documented status and payment status", () => {
    for (const [dto, ui] of [["PENDING_REVIEW", "pending_review"], ["CONFIRMED", "confirmed"], ["REJECTED", "rejected"], ["READY_FOR_PICKUP", "ready_for_pickup"], ["COLLECTED", "collected"], ["CANCELLED", "cancelled"], ["EXPIRED", "expired"]] as const) {
      expect(toCustomerReservation({ ...reservationView, status: dto })!.status).toBe(ui);
    }
    expect(toCustomerReservation({ ...reservationView, paymentStatus: "PARTIAL" })!.payment.status).toBe("partial");
  });

  it("refuses an answer it cannot show truthfully (unknown status, unreadable money) instead of inventing figures", () => {
    expect(toCustomerReservation({ ...reservationView, status: "ARCHIVED" as ReservationViewDto["status"] })).toBeNull();
    expect(toCustomerReservation({ ...reservationView, totals: [{ currency: "HTG", amount: "??" }] })).toBeNull();
    expect(toCustomerReservation({ ...reservationView, lines: [{ ...reservationView.lines[0], lineTotal: "" }] })).toBeNull();
  });

  it("shows customer-visible notes and the store's reasons, and never anything the API did not send", () => {
    const withEvents = toCustomerReservation({ ...reservationView, status: "REJECTED", events: [
      ...reservationView.events,
      { type: "NOTE", at: "2026-11-16T19:00:00Z", note: "Passez demain", rejectReason: null, cancelledBy: null },
      { type: "REJECTED", at: "2026-11-16T20:00:00Z", note: null, rejectReason: "QUANTITY_UNAVAILABLE", cancelledBy: null },
      { type: "FUTURE_EVENT" as "NOTE", at: "2026-11-16T21:00:00Z", note: null, rejectReason: null, cancelledBy: null },
    ] })!;
    expect(withEvents.events.map((e) => e.type)).toEqual(["submitted", "note_added", "rejected"]); // an unknown event kind is left out, not mislabelled
    expect(withEvents.events[1].note).toBe("Passez demain");
    expect(withEvents.events[2].rejectReason).toBe("quantity_unavailable");
    // the view model cannot even express internal notes, staff identities, ledger entries or payment references
    expect(Object.keys(v).sort()).toEqual(["balances", "canCancel", "createdAt", "customer", "events", "expiresAt", "id", "lines", "locale", "payment", "payments", "pickup", "readyAt", "reference", "status", "totals"]);
    expect(JSON.stringify(v)).not.toMatch(/internal|staff|ledger|userId|customerId/i);
  });

  it("maps the payment history, each payment in its own currency, and shows nothing when the API sent none", () => {
    expect(v.payments).toEqual([]);
    const paid = toCustomerReservation({ ...reservationView, payments: [
      { currency: "USD", amount: "180.00", method: "STRIPE_CHECKOUT", receivedAt: "2026-11-17T15:00:00Z", reversed: false },
      { currency: "HTG", amount: "25000.00", method: "CASH_AT_PICKUP", receivedAt: "2026-11-17T16:00:00Z", reversed: true },
    ] })!;
    expect(paid.payments.map((p) => [p.method, p.money.currency, p.money.amount, p.reversed])).toEqual([["STRIPE_CHECKOUT", "USD", 18000, false], ["CASH_AT_PICKUP", "HTG", 2500000, true]]);
    expect(JSON.stringify(paid.payments)).not.toMatch(/reference|recordedBy|note/i);   // the view model cannot hold a payment reference or a staff identity
    expect(toCustomerReservation({ ...reservationView, payments: [{ currency: "USD", amount: "??", method: "STRIPE_CHECKOUT", receivedAt: "2026-11-17T15:00:00Z", reversed: false }] })).toBeNull();
  });

  it("shows the pickup promised AT submission (the snapshot); absent pickup is reported, not invented", () => {
    expect(v.pickup?.location).toMatchObject({ storeName: "Magasin test", addressLine: "1 rue Test", city: "Ville", phone: "+509 0000 0000" });
    expect(toCustomerReservation({ ...reservationView, pickup: { location: null, instructions: null, capturedAt: "x", origin: "default" } })!.pickup).toBeNull();
    expect(toCustomerReservation({ ...reservationView, pickup: null })!.pickup).toBeNull();
  });

  it("expiry is shown only when the server sets one", () => {
    expect(toCustomerReservation({ ...reservationView, expiresAt: "2026-12-01T00:00:00Z" })!.expiresAt).toBe("2026-12-01T00:00:00Z");
  });
});

describe("toPickupView", () => {
  it("passes available details through and ignores impossible schedule days", () => {
    const v = toPickupView(pickupAvailable);
    expect(v.status).toBe("available");
    if (v.status === "available") expect(v.location.schedule.map((d) => d.day)).toEqual([1]);
  });
  it("disabled shows only the owner's message; not_configured and a location-less 'available' show nothing", () => {
    expect(toPickupView({ status: "disabled", unavailableMessage: { fr: "Fermé", ht: "Fèmen" }, location: null, instructions: null })).toEqual({ status: "disabled", message: { fr: "Fermé", ht: "Fèmen" } });
    expect(toPickupView({ status: "not_configured", unavailableMessage: null, location: null, instructions: null })).toEqual({ status: "not_configured" });
    expect(toPickupView({ status: "available", unavailableMessage: null, location: null, instructions: null })).toEqual({ status: "not_configured" });
  });
});
