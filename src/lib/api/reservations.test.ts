import { beforeEach, describe, expect, it } from "vitest";
import { reservationStore } from "../stores/reservation-store";
import { runReservationAction, resetDemoData } from "./reservations";

beforeEach(() => resetDemoData());

describe("administration demo: workflow actions", () => {
  it("applies workflow rules through the service and persists accepted changes", async () => {
    const bad = await runReservationAction("res-1", { type: "markReady", pickupConfirmed: true }, { kind: "staff", name: "A" });
    expect(bad).toEqual({ ok: false, error: "invalid_status" });
    const good = await runReservationAction("res-1", { type: "accept", customerNote: "ok" }, { kind: "staff", name: "A" });
    expect(good.ok).toBe(true);
    expect(reservationStore.getSnapshot().find((r) => r.id === "res-1")?.status).toBe("confirmed");
    expect(await runReservationAction("nope", { type: "accept" }, { kind: "staff", name: "A" })).toEqual({ ok: false, error: "not_found" });
  });
});
