import path from "node:path";
import type { NextConfig } from "next";
import { validateSupabaseConfig } from "./src/lib/auth/config";
import { securityHeaders, securityWarnings } from "./src/lib/security/headers";

/**
 * NEXT_PUBLIC_* values are inlined into the browser bundle at BUILD time, so a secret placed there would ship to every visitor even though the
 * runtime validator would refuse to use it. Fail the build instead (the message carries problem codes only, never the value).
 */
const supabaseCheck = validateSupabaseConfig({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
if (!supabaseCheck.ok && supabaseCheck.problems.includes("key_is_secret")) {
  throw new Error("Refusing to build: the public Supabase key variable holds a secret/service-role key (key_is_secret). Use the publishable/anon key; secrets must never be NEXT_PUBLIC_*.");
}

/** Old (removed) auth URLs -> the Supabase UI block routes. Bookmarks and old e-mails keep working; nothing renders at the old paths. */
const legacyAuthPaths: Record<string, string> = {
  "/login": "/auth/login",
  "/sign-in": "/auth/login",
  "/admin/sign-in": "/auth/login?next=%2Fadmin",
  "/register": "/auth/sign-up",
  "/sign-up": "/auth/sign-up",
  "/forgot-password": "/auth/forgot-password",
  "/reset-password": "/auth/update-password",
  "/verify-email": "/auth/login",
};

securityWarnings().forEach((w) => console.warn(`[security] ${w}`));

const nextConfig: NextConfig = {
  async headers() {
    return securityHeaders();
  },
  async redirects() {
    return Object.entries(legacyAuthPaths).flatMap(([from, to]) => [
      { source: from, destination: to, permanent: false },
      { source: `/:locale(fr|ht)${from}`, destination: `/:locale${to}`, permanent: false },
    ]);
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // Pin the workspace root (a stray lockfile exists higher in the home directory).
    root: path.resolve(import.meta.dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
