import { describe, expect, it } from "vitest";
import { sampleReservations } from "../mock/reservations";
import { toCustomerView } from "./customer-view";
import type { Reservation } from "./types";

describe("customer view never leaks internal data", () => {
  it("strips internal notes, staff names and internal-only events from every sample", () => {
    for (const r of sampleReservations) {
      const json = JSON.stringify(toCustomerView(r));
      for (const e of r.events) {
        if (e.internalNote) expect(json).not.toContain(e.internalNote);
      }
      for (const p of r.payment.records) {
        if (p.internalNote) expect(json).not.toContain(p.internalNote);
      }
      expect(json).not.toContain("Personnel exemple");
      expect(json).not.toContain("internalNote");
    }
  });

  it("hides note-only internal events but keeps customer-visible ones", () => {
    const base: Reservation = structuredClone(sampleReservations.find((r) => r.reference === "ANA-CONF01")!);
    base.events.push({ id: "x1", type: "note_added", at: "2026-11-13T00:00:00Z", actor: { kind: "staff", name: "S" }, internalNote: "TOP-SECRET" });
    base.events.push({ id: "x2", type: "note_added", at: "2026-11-13T01:00:00Z", actor: { kind: "staff", name: "S" }, customerNote: "Visible au client" });
    const view = toCustomerView(base);
    expect(JSON.stringify(view)).not.toContain("TOP-SECRET");
    expect(view.events.find((e) => e.id === "x2")?.note).toBe("Visible au client");
    expect(view.events.find((e) => e.id === "x1")).toBeUndefined();
  });

  it("reports who cancelled without exposing staff identity", () => {
    const byCustomer = toCustomerView(sampleReservations.find((r) => r.reference === "ANA-CANC01")!);
    expect(byCustomer.events.at(-1)?.cancelledBy).toBe("customer");
  });
});
