import type { Permission } from "@/lib/auth/authorization";

/**
 * Which permission each administration page needs (D14). Used to hide navigation entries and to show "not available for your role" instead of a page whose API calls
 * would be refused. The backend is the real gate; this table only mirrors `AdminAccessRules` so the screen does not offer what the server will refuse.
 * `null` = every team member (the dashboard adapts to the role). An unlisted admin page needs the owner's TEAM_MANAGE: closed by default, like the API.
 */
const PAGES: { prefix: string; permission: Permission | null; exact?: boolean }[] = [
  { prefix: "/admin", permission: null, exact: true },
  { prefix: "/admin/reservations", permission: "RESERVATIONS" },
  { prefix: "/admin/payments", permission: "REPORTS_VIEW" },
  { prefix: "/admin/products", permission: "CATALOG_MANAGE" },
  { prefix: "/admin/categories", permission: "CATALOG_MANAGE" },
  { prefix: "/admin/inventory", permission: "INVENTORY_VIEW" },
  { prefix: "/admin/customers", permission: "CUSTOMERS_VIEW" },
  { prefix: "/admin/reports", permission: "REPORTS_VIEW" },
  { prefix: "/admin/notifications", permission: "NOTIFICATIONS_VIEW" },
  { prefix: "/admin/team", permission: "TEAM_MANAGE" },
  { prefix: "/admin/settings", permission: "SETTINGS_MANAGE" },
  { prefix: "/admin/pickup-settings", permission: "SETTINGS_MANAGE" },
];

export function requiredPermission(pathname: string): Permission | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const page of PAGES) {
    if (page.exact ? path === page.prefix : path === page.prefix || path.startsWith(`${page.prefix}/`)) return page.permission;
  }
  return "TEAM_MANAGE";
}

export function canOpenAdminPage(permissions: readonly string[], pathname: string): boolean {
  const needed = requiredPermission(pathname);
  return needed === null || permissions.includes(needed);
}
