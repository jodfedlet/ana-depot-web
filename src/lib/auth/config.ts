/**
 * Supabase Auth configuration. Both values are PUBLIC by design (the anon key is safe in the browser; row access is
 * governed by the backend, not by this key). The service-role key is never read, referenced or required by this app.
 * `NEXT_PUBLIC_*` variables must be referenced literally so Next can inline them into the browser bundle.
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function readSupabaseConfig(env: { url?: string; anonKey?: string }): SupabaseConfig | null {
  const url = env.url?.trim();
  const anonKey = env.anonKey?.trim();
  if (!url || !anonKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return null;
  } catch {
    return null;
  }
  return { url, anonKey };
}

/** Null when authentication is not configured: screens then say so instead of pretending to work. */
export function getSupabaseConfig(): SupabaseConfig | null {
  return readSupabaseConfig({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
}
