"use client";

import { useSyncExternalStore } from "react";
import { type AuthUser, authStore } from "./auth-store";

/**
 * The signed-in customer/staff identity for display. `session` is null while loading AND when signed out: check
 * `status` when the difference matters. Replaces the old demo session store; nothing here is persisted locally.
 */
export function useSession(): { status: "loading" | "signed_out" | "signed_in"; session: AuthUser | null; signOut: () => Promise<boolean> } {
  const state = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getServerSnapshot);
  return { status: state.status, session: state.user, signOut: authStore.signOut };
}
