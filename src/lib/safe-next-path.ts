/**
 * Supabase UI library item `safe-next-path` (https://supabase.com/ui/r/safe-next-path.json), copied verbatim. It is the registry dependency of the
 * `password-based-auth-nextjs` and `social-auth-nextjs` blocks and the only open-redirect guard for post-sign-in destinations.
 */
export const safeNextPath = (path: unknown, fallback = '/', origin?: string) => {
  if (typeof path !== 'string' || !path.startsWith('/')) return fallback

  const currentOrigin = origin ?? window.location.origin

  try {
    const url = new URL(path, currentOrigin)
    return url.origin === currentOrigin ? `${url.pathname}${url.search}${url.hash}` : fallback
  } catch {
    return fallback
  }
}
