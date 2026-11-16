import { afterEach, describe, expect, it, vi } from "vitest";
import { browserApiBaseUrl, serverApiBaseUrl } from "./base-url";

afterEach(() => vi.unstubAllEnvs());

describe("API base URL resolution (mocked env)", () => {
  it("server prefers the server-only URL, falls back to the public one; browser only ever sees the public one", () => {
    vi.stubEnv("API_BASE_URL", "http://internal:8080");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    expect(serverApiBaseUrl()).toBe("http://internal:8080");
    expect(browserApiBaseUrl()).toBe("https://api.example.com");
    vi.stubEnv("API_BASE_URL", "");
    expect(serverApiBaseUrl()).toBe("https://api.example.com");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    expect(serverApiBaseUrl()).toBeUndefined();
    expect(browserApiBaseUrl()).toBeUndefined();
  });
});
