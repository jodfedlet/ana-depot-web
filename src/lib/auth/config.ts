/**
 * Supabase Auth configuration: read AND validated in this one place. Both values are PUBLIC by design (the publishable/anon key is
 * safe in the browser; data access is governed by the backend, not by this key). The service-role/secret key is never read,
 * referenced or required by this app - and a configuration that smells like one is REJECTED so it can never be shipped to a browser.
 * `NEXT_PUBLIC_*` variables must be referenced literally so Next can inline them into the browser bundle; they are inlined at BUILD
 * time, so changing them requires a rebuild.
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Why a configuration was refused. Codes only: values (and key fragments) are never part of a problem. */
export type ConfigProblem =
  | "url_missing"
  | "url_malformed"
  | "url_insecure" // http outside localhost
  | "key_missing"
  | "key_malformed" // not a publishable key and not a JWT-shaped legacy anon key
  | "key_is_secret"; // sb_secret_* or a JWT whose role is service_role: must never be public

export type ConfigResult = { ok: true; config: SupabaseConfig } | { ok: false; problems: ConfigProblem[] };

const PUBLISHABLE = /^sb_publishable_[A-Za-z0-9_-]{16,}$/;
const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

function jwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? atob(payload + "=".repeat((4 - (payload.length % 4)) % 4)) : Buffer.from(payload, "base64").toString();
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

export function validateSupabaseConfig(env: { url?: string; anonKey?: string }): ConfigResult {
  const problems: ConfigProblem[] = [];
  const url = env.url?.trim() ?? "";
  const key = env.anonKey?.trim() ?? "";

  if (!url) problems.push("url_missing");
  else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") problems.push("url_malformed");
      else if (parsed.protocol === "http:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") problems.push("url_insecure");
    } catch {
      problems.push("url_malformed");
    }
  }

  if (!key) problems.push("key_missing");
  else if (key.startsWith("sb_secret_")) problems.push("key_is_secret");
  else if (PUBLISHABLE.test(key)) {
    /* ok */
  } else if (JWT.test(key)) {
    const role = jwtRole(key);
    if (role === "service_role") problems.push("key_is_secret");
    else if (role !== "anon") problems.push("key_malformed"); // a legacy anon key carries role=anon
  } else problems.push("key_malformed");

  return problems.length ? { ok: false, problems } : { ok: true, config: { url, anonKey: key } };
}

/** Back-compat helper used by older call sites and tests: the config, or null when it is missing/invalid. */
export function readSupabaseConfig(env: { url?: string; anonKey?: string }): SupabaseConfig | null {
  const result = validateSupabaseConfig(env);
  return result.ok ? result.config : null;
}

let logged = false;

/**
 * The validated configuration, or null when authentication is unavailable (screens then render the localized "unavailable" state with no inputs).
 * The reason is logged ONCE on the server as problem codes only (never values). The public key is read from the publishable variable first,
 * then from the legacy anon variable.
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const result = validateSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (result.ok) return result.config;
  if (typeof window === "undefined" && !logged) {
    logged = true;
    console.error(`[auth] Supabase configuration rejected (${result.problems.join(", ")}). Authentication is unavailable. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY); they are inlined at build time.`);
  }
  return null;
}
