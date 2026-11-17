import { getBrowserClient } from "@/lib/auth/supabase-browser";
import { browserApiClient } from "./client";
import { ApiError } from "./http";

/**
 * The API client for calls made AS the signed-in person (customer account, staff administration). The Supabase session is read on every call (so a
 * refreshed token is used); when the session cannot supply a token the call FAILS with `session_expired` instead of being sent anonymously — a
 * signed-in action must never silently become a guest call. Authorization itself (customer vs staff) is the API's decision, never the browser's.
 */
export async function signedInClient() {
  const client = browserApiClient();
  if (!client) throw new ApiError({ status: 0, code: "api_not_configured" });
  const { data } = (await getBrowserClient()?.auth.getSession()) ?? { data: { session: null } };
  if (!data.session?.access_token) throw new ApiError({ status: 401, code: "session_expired" });
  return client;
}
