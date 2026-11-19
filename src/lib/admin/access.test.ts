import { describe, expect, it } from "vitest";
import { canOpenAdminPage, requiredPermission } from "./access";

/** The D14 page table, restated independently of the implementation. The server enforces the same rules; this only keeps the screens from offering what it refuses. */
const STAFF = ["RESERVATIONS", "PAYMENTS_RECORD", "INVENTORY_VIEW", "CUSTOMERS_VIEW", "NOTIFICATIONS_VIEW"];
const MANAGER = [...STAFF, "PAYMENTS_CORRECT", "INVENTORY_ADJUST", "CATALOG_MANAGE", "CUSTOMERS_EDIT", "REPORTS_VIEW", "NOTIFICATIONS_RESEND"];
const OWNER = [...MANAGER, "SETTINGS_MANAGE", "TEAM_MANAGE"];

describe("administration page access by role", () => {
  it.each([
    ["/admin", true, true, true],
    ["/admin/reservations", true, true, true],
    ["/admin/reservations/ANA-ABC123", true, true, true],
    ["/admin/inventory", true, true, true],
    ["/admin/customers", true, true, true],
    ["/admin/customers/123", true, true, true],
    ["/admin/notifications", true, true, true],
    ["/admin/payments", false, true, true],
    ["/admin/reports", false, true, true],
    ["/admin/products", false, true, true],
    ["/admin/products/new", false, true, true],
    ["/admin/categories", false, true, true],
    ["/admin/team", false, false, true],
    ["/admin/settings", false, false, true],
    ["/admin/pickup-settings", false, false, true],
    ["/admin/anything-new", false, false, true],   // unlisted pages are closed to everyone but the owner, like the API
  ])("%s -> staff %s, manager %s, owner %s", (path, staff, manager, owner) => {
    expect(canOpenAdminPage(STAFF, path)).toBe(staff);
    expect(canOpenAdminPage(MANAGER, path)).toBe(manager);
    expect(canOpenAdminPage(OWNER, path)).toBe(owner);
  });

  it("ignores a trailing slash and never matches a longer sibling name", () => {
    expect(requiredPermission("/admin/team/")).toBe("TEAM_MANAGE");
    expect(requiredPermission("/admin/reservations-archive")).toBe("TEAM_MANAGE");   // not a prefix match on the word
  });

  it("denies everything when no permission was granted", () => {
    expect(canOpenAdminPage([], "/admin/reservations")).toBe(false);
    expect(canOpenAdminPage([], "/admin")).toBe(true);   // the home page decides what to show; its data calls are authorized by the server
  });
});
