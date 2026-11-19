import type { Me } from "./me";

/** What a team member may do (D14). The names are the backend's own (`/me.permissions`); the backend decides, this only decides what to RENDER. */
export type Permission =
  | "RESERVATIONS" | "PAYMENTS_RECORD" | "PAYMENTS_CORRECT" | "INVENTORY_VIEW" | "INVENTORY_ADJUST" | "CATALOG_MANAGE" | "CUSTOMERS_VIEW" | "CUSTOMERS_EDIT"
  | "REPORTS_VIEW" | "NOTIFICATIONS_VIEW" | "NOTIFICATIONS_RESEND" | "SETTINGS_MANAGE" | "TEAM_MANAGE";

export const staffRoles = ["OWNER", "MANAGER", "STAFF"] as const;
export type StaffRole = (typeof staffRoles)[number];

/**
 * The ONE place that decides what a signed-in user may do in the UI. `canAccessAdmin`: is this person an active team member. `hasPermission`: did the BACKEND
 * grant this permission (deny by default: unknown names and missing lists grant nothing). This only decides what to RENDER — the backend authorizes every
 * `/api/v1/admin/**` request itself, so a hidden button is a convenience, never the protection.
 */
export function canAccessAdmin(me: Me | null | undefined): boolean {
  return me?.staff === true;
}

export function hasPermission(me: Me | null | undefined, permission: Permission | string): boolean {
  return me?.staff === true && me.permissions.includes(permission);
}
