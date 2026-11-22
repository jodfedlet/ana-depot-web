import { describe, expect, it } from "vitest";
import { isValidEmail, isValidPhone } from "./validation";

describe("validation", () => {
  it("validates emails", () => {
    expect(isValidEmail("name@example.com")).toBe(true);
    expect(isValidEmail("name@example")).toBe(false);
    expect(isValidEmail("name @example.com")).toBe(false);
  });
  it("validates international phone numbers by digit count", () => {
    expect(isValidPhone("+1 (555) 010-0100")).toBe(true);
    expect(isValidPhone("+509 0000 0000")).toBe(true);
    expect(isValidPhone("5+09 0000")).toBe(false);
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("555-CALL-NOW")).toBe(false);
  });
});
