import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { type AdminAccess, resolveAdminAccess } from "./admin-access";
import { getSupabaseConfig } from "./config";
import { fetchMe } from "./me";

/** Server-side Supabase client bound to the request's cookies (Server Components, Route Handlers). */
export async function createServerSupabase() {
  const config = getSupabaseConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => {
        // Server Components cannot write cookies; the proxy refreshes the session, so ignoring is safe there.
        try {
          all.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component */
        }
      },
    },
  });
}

/**
 * The verified signed-in user for this request, or null. Uses `getUser()` (Supabase validates the token) — never the
 * unverified cookie contents.
 */
export const getVerifiedUser = cache(async () => {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
});

/** Admin access for this request (cached per request). Server-side and default-deny; see `resolveAdminAccess`. */
export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  const supabase = await createServerSupabase();
  return resolveAdminAccess({
    configured: supabase !== null,
    getVerifiedUser,
    getAccessToken: async () => (supabase ? ((await supabase.auth.getSession()).data.session?.access_token ?? null) : null),
    fetchMe: (accessToken) => fetchMe({ apiBaseUrl: process.env.API_BASE_URL, accessToken }),
  });
});
