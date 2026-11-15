import { describe, expect, it } from "vitest";
import { recentActivity } from "../activity";
import { seedMovements } from "../mock/catalog-seed";
import { sampleReservations } from "../mock/reservations";
import { groupCustomers } from "./customers";

describe("customers derived from reservations", () => {
  it("groups by phone, newest first, and counts each customer's reservations", () => {
    const customers = groupCustomers(sampleReservations);
    const alex = customers.find((c) => c.name === "Alex Sample")!;
    expect(alex.reservations.map((r) => r.reference).sort()).toEqual(["ANA-PEND01", "ANA-READY1"]);
    expect(alex.hasAccount).toBe(true);
    expect(customers.find((c) => c.name === "Marie Exemple")!.hasAccount).toBe(false);
    expect(customers.length).toBe(new Set(sampleReservations.map((r) => `${r.customer.dialCode}${r.customer.phone}`.replace(/\D/g, ""))).size);
    expect(customers[0].lastAt >= customers.at(-1)!.lastAt).toBe(true);
  });
  it("merges an e-mail found on a later reservation by the same phone", () => {
    const [a, b] = [structuredClone(sampleReservations[1]), structuredClone(sampleReservations[1])];
    b.id = "x"; b.createdAt = "2026-11-15T00:00:00Z"; b.customer.email = "marie@example.com";
    expect(groupCustomers([a, b])[0]).toMatchObject({ email: "marie@example.com", hasAccount: true });
  });
});

describe("recent activity", () => {
  it("merges reservation events and stock movements by time, newest first, skipping opening balances", () => {
    const items = recentActivity(sampleReservations, seedMovements(), 50);
    expect(items.every((i, n) => n === 0 || items[n - 1].at >= i.at)).toBe(true);
    expect(items.some((i) => i.kind === "stock" && i.movement.type === "initial")).toBe(false);
    expect(items.some((i) => i.kind === "reservation")).toBe(true);
    expect(recentActivity(sampleReservations, [], 3)).toHaveLength(3);
  });
});
