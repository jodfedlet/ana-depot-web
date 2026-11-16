import { describe, expect, it } from "vitest";
import { sampleReservations } from "../mock/reservations";
import { amountIn } from "../money";
import { balances } from "../reservations/workflow";
import { collectedValue, countIn, openValue, outstandingAtPickup, outstandingRows, paymentsIn, paymentsReceived, reservationValue } from "./finance";

describe("finance figures (mocked demo data; HTG and USD are never combined)", () => {
  it("every figure is a per-currency list with at most one entry per currency", () => {
    for (const figure of [paymentsReceived(sampleReservations), openValue(sampleReservations), collectedValue(sampleReservations), outstandingAtPickup(sampleReservations)]) {
      const codes = figure.map((m) => m.currency);
      expect(new Set(codes).size).toBe(codes.length);
      expect(codes.every((c) => c === "HTG" || c === "USD")).toBe(true);
    }
  });

  it("payments received equals the sum of the recorded payments in each currency", () => {
    const records = paymentsIn(sampleReservations);
    expect(records.length).toBeGreaterThan(0);
    const received = paymentsReceived(sampleReservations);
    for (const code of ["HTG", "USD"] as const) {
      expect(amountIn(received, code)).toBe(records.filter((p) => p.currency === code).reduce((n, p) => n + p.amount, 0));
    }
  });

  it("only payments are money in: open or rejected reservations add nothing to payments received", () => {
    const withoutPayments = sampleReservations.filter((r) => r.payment.records.length === 0);
    expect(paymentsReceived(withoutPayments)).toEqual([]);
    // an open reservation has value but it is not revenue
    expect(openValue(sampleReservations).length).toBeGreaterThan(0);
    expect(paymentsReceived(sampleReservations.filter((r) => r.status === "pending_review"))).toEqual([]);
  });

  it("outstanding balances are due amounts on READY reservations, per currency", () => {
    const rows = outstandingRows(sampleReservations);
    expect(rows.every((x) => x.reservation.status === "ready_for_pickup")).toBe(true);
    const total = outstandingAtPickup(sampleReservations);
    for (const code of ["HTG", "USD"] as const) {
      const expected = rows.flatMap((x) => x.reservation && balances(x.reservation)).filter((b) => b.currency === code).reduce((n, b) => n + b.due.valueOf(), 0);
      expect(amountIn(total, code)).toBe(expected);
    }
  });

  it("a period filters by payment date and by reservation date", () => {
    expect(paymentsReceived(sampleReservations, { from: "2999-01-01" })).toEqual([]);
    expect(paymentsReceived(sampleReservations, { to: "1999-01-01" })).toEqual([]);
    expect(countIn(sampleReservations, ["collected"], { from: "2999-01-01" })).toBe(0);
    expect(reservationValue(sampleReservations, ["collected"], { to: "2000-01-01" })).toEqual([]);
  });
});
