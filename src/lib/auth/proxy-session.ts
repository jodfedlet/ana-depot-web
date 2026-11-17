import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { authCookieOptions } from "./cookie-options";
import { getSupabaseConfig } from "./config";

const hasAuthCookie = (request: NextRequest) => request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

/**
 * Keeps the Supabase session fresh: verifies the access token and, when it is about to expire, refreshes it and writes
 * the new cookies onto the response. Only runs for visitors who already have an auth cookie, so anonymous browsing
 * pays nothing. This is NOT an authorization layer — pages and the backend check access themselves.
 */
export async function refreshAuthSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  if (!config || !hasAuthCookie(request)) return response;
  const supabase = createServerClient(config.url, config.anonKey, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        all.forEach(({ name, value }) => request.cookies.set(name, value));
        all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  try {
    await supabase.auth.getClaims();
  } catch {
    /* an unreachable auth server must not take the storefront down */
  }
  return response;
}
