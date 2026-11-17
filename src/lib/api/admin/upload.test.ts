import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ ticket: vi.fn(), complete: vi.fn() }));
vi.mock("./endpoints", () => ({ requestImageUpload: calls.ticket, completeImageUpload: calls.complete }));

import { ApiError } from "../http";
import { uploadProductImage } from "./upload";

const ticket = { uploadId: "u1", productId: "p1", contentType: "image/png", maxBytes: 1000, upload: { url: "https://r2.test/obj?sig", method: "PUT", headers: { "Content-Type": "image/png" }, expiresAt: "" } };
const file = (type = "image/png", size = 10) => new File([new Uint8Array(size)], "a.png", { type });

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => void m.delete(k), setItem: (k, v) => void m.set(k, v) };
}
beforeEach(() => { vi.stubGlobal("window", { sessionStorage: memoryStorage() }); calls.ticket.mockReset(); calls.complete.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe("product image upload (MOCKED API and object store)", () => {
  it("asks for a ticket, sends the bytes with the ticket's headers, then completes — in that order", async () => {
    const order: string[] = [];
    calls.ticket.mockImplementation(async () => { order.push("ticket"); return ticket; });
    calls.complete.mockImplementation(async () => { order.push("complete"); return { id: "i1", url: "https://img/x.png", alt: {}, position: 0 }; });
    const put = vi.fn(async (_t, _f, progress: (n: number) => void) => { order.push("put"); progress(0.5); });
    const seen: number[] = [];
    const image = await uploadProductImage("p1", file(), (n) => seen.push(n), put);
    expect(order).toEqual(["ticket", "put", "complete"]);
    expect(put.mock.calls[0][0]).toBe(ticket);
    expect(seen).toEqual([0.5, 1]);
    expect(image.id).toBe("i1");
    expect(calls.ticket.mock.calls[0].slice(0, 3)).toEqual(["p1", "image/png", 10]);
  });
  it("refuses a disallowed type or an empty file before any request", async () => {
    await expect(uploadProductImage("p1", file("image/gif"), undefined, vi.fn())).rejects.toMatchObject({ problem: { code: "upload_type_not_allowed" } });
    await expect(uploadProductImage("p1", file("image/png", 0), undefined, vi.fn())).rejects.toMatchObject({ problem: { code: "upload_missing" } });
    expect(calls.ticket).not.toHaveBeenCalled();
  });
  it("a failed direct upload never calls complete (the product keeps its images)", async () => {
    calls.ticket.mockResolvedValue(ticket);
    const put = vi.fn(async () => { throw new ApiError({ status: 403, code: "upload_put_failed" }); });
    await expect(uploadProductImage("p1", file(), undefined, put)).rejects.toMatchObject({ problem: { code: "upload_put_failed" } });
    expect(calls.complete).not.toHaveBeenCalled();
  });
  it("a refused completion surfaces the server's code", async () => {
    calls.ticket.mockResolvedValue(ticket);
    calls.complete.mockRejectedValue(new ApiError({ status: 422, code: "upload_signature_mismatch" }));
    await expect(uploadProductImage("p1", file(), undefined, vi.fn(async () => undefined))).rejects.toMatchObject({ problem: { code: "upload_signature_mismatch" } });
  });
  it("retrying the SAME file after an uncertain outcome reuses the same idempotency key; a different file does not", async () => {
    calls.ticket.mockResolvedValue(ticket);
    const lost = vi.fn(async () => { throw new ApiError({ status: 0, code: "network_error" }); });
    const f = file();
    await uploadProductImage("p1", f, undefined, lost).catch(() => undefined);
    await uploadProductImage("p1", f, undefined, lost).catch(() => undefined);
    const keys = calls.ticket.mock.calls.map((c) => (c[3] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    await uploadProductImage("p1", file("image/png", 20), undefined, lost).catch(() => undefined);
    expect((calls.ticket.mock.calls[2][3] as { idempotencyKey: string }).idempotencyKey).not.toBe(keys[0]);
  });
});
