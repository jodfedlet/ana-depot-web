// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { authCookieOptions } from "./cookie-options";

afterEach(() => vi.unstubAllEnvs());

describe("authCookieOptions (server side)", () => {
  it("is not Secure on plain-http deployments", () => {
    vi.stubEnv("SECURITY_HTTPS_ONLY", "");
    expect(authCookieOptions()).toEqual({ secure: false });
  });
  it("is Secure when the deployment is HTTPS-only", () => {
    for (const v of ["true", "TRUE", "1", "yes"]) {
      vi.stubEnv("SECURITY_HTTPS_ONLY", v);
      expect(authCookieOptions()).toEqual({ secure: true });
    }
  });
});
