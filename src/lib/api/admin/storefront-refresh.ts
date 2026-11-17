import { getBrowserClient } from "@/lib/auth/supabase-browser";

/**
 * After a staff write that changes what the storefront shows (catalog, prices, images, stock, reservations that move stock), ask the web server to drop its catalog cache so
 * the change is visible to customers (and search engines) at once. Best effort and silent: if it fails the cache simply expires within a minute; the write itself already
 * succeeded and is never reported as failed because of this. The server re-checks that the caller is staff (`POST /api/revalidate-catalog`).
 */
export async function refreshStorefront(): Promise<void> {
  try {
    const { data } = (await getBrowserClient()?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/revalidate-catalog", { method: "POST", headers: { Authorization: `Bearer ${token}` }, keepalive: true, signal: AbortSignal.timeout(5000) });
  } catch {
    /* best effort */
  }
}

/** Wraps a successful staff write: the result is returned untouched, then the storefront cache is refreshed in the background. */
export const refreshesStorefront = <T>(write: Promise<T>): Promise<T> => write.then((result) => { void refreshStorefront(); return result; });
