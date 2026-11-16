import { browserApiBaseUrl, serverApiBaseUrl } from "./base-url";
import { type ApiClientOptions, createApiClient } from "./http";
import { getBrowserClient } from "@/lib/auth/supabase-browser";

/**
 * Ready-made API clients. Which calls are made from where (see docs/authentication.md):
 *  - BROWSER: `browserApiClient()` — uses `NEXT_PUBLIC_API_BASE_URL` and forwards the CURRENT Supabase access token
 *    (read from the session on every call, so refreshed tokens are used; the token is never logged or stored by this code).
 *  - SERVER: `serverApiClient(token)` — uses `API_BASE_URL` (or the public one) with a token the caller already verified.
 * Neither is used by the demo data screens yet; they are the single place a future connected screen should start from.
 */
export function browserApiClient(options: Partial<ApiClientOptions> = {}) {
  const baseUrl = browserApiBaseUrl();
  if (!baseUrl) return null;
  return createApiClient({
    baseUrl,
    getAccessToken: async () => {
      const client = getBrowserClient();
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
    ...options,
  });
}

export function serverApiClient(accessToken: string | null, options: Partial<ApiClientOptions> = {}) {
  const baseUrl = serverApiBaseUrl();
  if (!baseUrl) return null;
  return createApiClient({ baseUrl, getAccessToken: async () => accessToken, ...options });
}
