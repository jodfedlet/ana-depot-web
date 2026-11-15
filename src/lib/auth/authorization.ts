import type { Me } from "./me";

/**
 * The ONE place that decides what a signed-in user may do in the UI. Today that is a single question: is this person
 * a store staff member? The role model and the permission matrix are undecided business matters, so no roles are
 * invented here; `permissions` is carried through so a later `hasPermission(me, "...")` can be added without
 * touching callers. This only decides what to RENDER — the backend authorizes every `/api/v1/admin/**` request itself.
 */
export function canAccessAdmin(me: Me | null | undefined): boolean {
  return me?.staff === true;
}

/** Reserved for the future permission model; returns false for anything not explicitly granted (deny by default). */
export function hasPermission(me: Me | null | undefined, permission: string): boolean {
  return me?.staff === true && me.permissions.includes(permission);
}
