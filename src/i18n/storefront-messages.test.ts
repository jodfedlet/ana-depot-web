import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getStorefrontMessages, getMessages } = await import("./server");

describe("the public dictionary carries no administration wording", () => {
  for (const locale of ["fr", "ht"] as const) {
    it(`${locale}: every administration group stays on the server, except the two the storefront uses`, () => {
      const store = getStorefrontMessages(locale) as Record<string, unknown>;
      const full = getMessages(locale) as unknown as Record<string, unknown>;
      const adminKeys = Object.keys(full).filter((k) => k === "admin" || k.startsWith("admin"));
      expect(adminKeys.length).toBeGreaterThan(5);
      for (const key of adminKeys) {
        if (key === "adminCommon") expect(store[key]).toBeDefined();
        else if (key === "adminTeam") expect(Object.keys(store[key] as object)).toEqual(["join"]);   // the "join the team" page
        else expect(store[key], `${locale}: ${key} must not reach the public pages`).toBeUndefined();
      }
    });

    it(`${locale}: the storefront dictionary is a fraction of the full one and has no staff screen text`, () => {
      const store = JSON.stringify(getStorefrontMessages(locale));
      const full = JSON.stringify(getMessages(locale));
      expect(store.length).toBeLessThan(full.length * 0.7);
      for (const staffOnly of ["Créer de nouveaux codes", "Kreye nouvo kòd", "Inviter un collègue", "Envite yon kolèg", "Changer le rôle", "Chanje wòl la"]) expect(store).not.toContain(staffOnly);
    });
  }
});
