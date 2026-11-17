import { describe, expect, it } from "vitest";
import { readTermsConfig } from "./terms";

describe("reservation terms configuration", () => {
  it("is absent (so reservations cannot be sent) unless the business supplied a version", () => {
    expect(readTermsConfig({})).toBeNull();
    expect(readTermsConfig({ version: "  " })).toBeNull();
    expect(readTermsConfig({ url: "https://example.test/terms" })).toBeNull(); // a link without a version label is not a version
  });
  it("accepts a version, and a link only when it is a path or an https URL", () => {
    expect(readTermsConfig({ version: "2026-11" })).toEqual({ version: "2026-11", url: null });
    expect(readTermsConfig({ version: "v1", url: "/info/terms" })).toEqual({ version: "v1", url: "/info/terms" });
    expect(readTermsConfig({ version: "v1", url: "https://example.test/terms" })?.url).toBe("https://example.test/terms");
    for (const bad of ["javascript:alert(1)", "http://insecure.test", "//evil.test", "terms"]) expect(readTermsConfig({ version: "v1", url: bad })?.url).toBeNull();
  });
});
