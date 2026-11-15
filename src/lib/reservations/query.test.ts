import { describe, expect, it } from "vitest";
import { sampleReservations } from "../mock/reservations";
import { countByStatus, dayKey, filterReservations, matchesSearch, reservationSorts } from "./query";

describe("reservation list query", () => {
  it("counts every status, summing to the total", () => {
    const counts = countByStatus(sampleReservations);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(sampleReservations.length);
    expect(counts.pending_review).toBe(2);
    expect(counts.ready_for_pickup).toBe(2);
  });
  it("searches by reference, name, phone digits and email", () => {
    const r = sampleReservations.find((x) => x.reference === "ANA-CONF01")!;
    expect(matchesSearch(r, "conf01")).toBe(true);
    expect(matchesSearch(r, "jean ex")).toBe(true);
    expect(matchesSearch(r, "0000 0303")).toBe(true);
    expect(matchesSearch(r, "jean@example")).toBe(true);
    expect(matchesSearch(r, "zzz")).toBe(false);
  });
  it("filters by status and date range using the store's time zone", () => {
    expect(filterReservations(sampleReservations, { status: "rejected" }).total).toBe(1);
    // 2026-11-14T15:20Z is still 14 Nov in Port-au-Prince; 02:00Z on the 15th is still the 14th there
    expect(dayKey("2026-11-15T02:00:00Z")).toBe("2026-11-14");
    const recent = filterReservations(sampleReservations, { from: "2026-11-12", to: "2026-11-14" });
    expect(recent.items.every((r) => ["ANA-PEND01", "ANA-PEND02", "ANA-CONF01"].includes(r.reference))).toBe(true);
  });
  it("sorts and paginates", () => {
    const oldest = filterReservations(sampleReservations, { sort: "oldest", pageSize: 50 }).items.map((r) => r.createdAt);
    expect(oldest).toEqual([...oldest].sort());
    // there is deliberately no sort by amount: reservations can hold several currencies, which are never compared
    expect(reservationSorts).toEqual(["newest", "oldest"]);
    const page2 = filterReservations(sampleReservations, { pageSize: 4, page: 2 });
    expect(page2.items).toHaveLength(4);
    expect(page2.pageCount).toBe(3);
    expect(filterReservations(sampleReservations, { pageSize: 4, page: 99 }).page).toBe(3);
    expect(filterReservations(sampleReservations, { q: "nothing-here" }).items).toEqual([]);
  });
});
