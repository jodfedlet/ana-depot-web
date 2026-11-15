import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserClient } from "./supabase-browser";

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  /** Display only (from user-editable metadata). Never used for authorization. */
  firstName: string;
}
export type AuthState = { status: "loading"; user: null } | { status: "signed_out"; user: null } | { status: "signed_in"; user: AuthUser };

const LOADING: AuthState = { status: "loading", user: null };
const SIGNED_OUT: AuthState = { status: "signed_out", user: null };

type SupabaseUser = { id: string; email?: string; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown> };
const toUser = (u: SupabaseUser): AuthUser => ({
  id: u.id,
  email: u.email ?? "",
  emailVerified: Boolean(u.email_confirmed_at),
  firstName: typeof u.user_metadata?.first_name === "string" ? u.user_metadata.first_name : "",
});

/**
 * Client-side mirror of the Supabase session for UI (header link, account menu, forms). It starts as "loading" and
 * only becomes "signed_in" after Supabase CONFIRMS the user (`getUser()` hits the auth server); it never trusts the raw
 * cookie. Pages that must be protected do not rely on this: they check on the server.
 */
export function createAuthStore(getClient: () => SupabaseClient | null) {
  let state: AuthState = LOADING;
  let started = false;
  const listeners = new Set<() => void>();
  const set = (next: AuthState) => {
    state = next;
    listeners.forEach((l) => l());
  };

  const confirm = async (client: SupabaseClient) => {
    const { data } = await client.auth.getSession();
    if (!data.session) return set(SIGNED_OUT);
    const verified = await client.auth.getUser();
    set(verified.error || !verified.data.user ? SIGNED_OUT : { status: "signed_in", user: toUser(verified.data.user) });
  };

  const start = () => {
    if (started) return;
    started = true;
    const client = getClient();
    if (!client) return set(SIGNED_OUT);
    void confirm(client);
    // Callbacks stay synchronous: calling Supabase inside them can deadlock the client.
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION")) return set(SIGNED_OUT);
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) set({ status: "signed_in", user: toUser(session.user) });
    });
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    getServerSnapshot: () => LOADING,
    /** Ends the session at Supabase (this browser only) and updates the UI once that has happened. */
    async signOut(): Promise<boolean> {
      const client = getClient();
      if (!client) return false;
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) return false;
      set(SIGNED_OUT);
      return true;
    },
  };
}

export const authStore = createAuthStore(getBrowserClient);
