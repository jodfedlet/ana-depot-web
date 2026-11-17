import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/http";
import { reportClientError, setErrorSink, toReport } from "./report";

afterEach(() => setErrorSink(null));

describe("client error reports are privacy-safe", () => {
  it("keeps the API code, status and correlation id but never the detail", () => {
    const e = new ApiError({ status: 422, code: "insufficient_stock", detail: "Marie Joseph +50937000000 wants 5", correlationId: "corr-123456" });
    const r = toReport(e, "/fr/reservations/ANA-1?phone=37000000#x");
    expect(r).toEqual({ name: "ApiError", code: "insufficient_stock", status: 422, correlationId: "corr-123456", path: "/fr/reservations/ANA-1" });
    expect(JSON.stringify(r)).not.toMatch(/Marie|37000000/);
  });
  it("scrubs tokens, e-mail addresses and phone numbers out of ordinary error messages and bounds the length", () => {
    const r = toReport(new Error("failed for jo@example.com 509 3700 0000 with Bearer abc.def.ghi " + "x".repeat(500)));
    expect(r.message).not.toMatch(/jo@example|3700|abc\.def/);
    expect(r.message!.length).toBeLessThanOrEqual(160);
  });
  it("sends to the registered sink, falls back to the console, and never throws", () => {
    const sink = vi.fn(() => { throw new Error("sink down"); });
    setErrorSink(sink);
    expect(() => reportClientError(new Error("x"), "/p")).not.toThrow();
    expect(sink).toHaveBeenCalledOnce();
    setErrorSink(null);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportClientError("not an error", "/p");
    expect(spy).toHaveBeenCalledWith("[client-error]", { name: "NonError", path: "/p" });
    spy.mockRestore();
  });
});
