/**
 * OAuth providers shown by the auth screens for this build. EMPTY by default: a provider is listed in NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS only after it has been
 * enabled and configured in the Supabase dashboard (docs/authentication.md), otherwise its button would lead to a Supabase error. Supported: google (inlined at build time).
 */
export const enabledOAuthProviders: readonly "google"[] = (process.env.NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter((p): p is "google" => p === "google");
