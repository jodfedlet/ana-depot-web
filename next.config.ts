import path from "node:path";
import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
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
