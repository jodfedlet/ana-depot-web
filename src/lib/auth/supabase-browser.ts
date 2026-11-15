import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

let client: SupabaseClient | null = null;

/**
 * The single browser-side Supabase client (official `@supabase/ssr`). Its session lives in cookies that the server
 * and the proxy can read — not in localStorage — and refresh tokens are rotated by Supabase. Returns null when
 * authentication is not configured.
 */
export function getBrowserClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) return null;
  client ??= createBrowserClient(config.url, config.anonKey);
  return client;
}
