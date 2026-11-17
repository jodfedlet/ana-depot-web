/**
 * Does this public product / category exist RIGHT NOW? Used by the proxy so an unknown, draft or inactive product answers a real HTTP 404 BEFORE the page starts streaming
 * (once a page has begun streaming, its status is fixed at 200: a "soft 404"). The answer comes from the public API; a small in-memory cache (per server process) keeps the
 * proxy fast and bounds the API load: "exists" for 60 s, "missing" for 10 s (a freshly published product shows up quickly), failures are not cached for long.
 *
 *   exists  -> the API returned the item
 *   missing -> the API said 404 (or the slug cannot be a slug)
 *   unknown -> the API could not be asked or failed: the proxy lets the request through and the page decides
 */
export type EntryState = "exists" | "missing" | "unknown";
export type EntryKind = "products" | "categories";

const TTL_MS: Record<EntryState, number> = { exists: 60_000, missing: 10_000, unknown: 3_000 };
const MAX_ENTRIES = 2_000;
const cache = new Map<string, { state: EntryState; until: number }>();

/** Public product/category identifiers: slugs (`a-b-c`) or UUIDs. Anything else cannot exist, so no API call is made for it. */
export const looksLikeSlug = (slug: string): boolean => /^[A-Za-z0-9][A-Za-z0-9-]{0,119}$/.test(slug);

export interface ExistsDeps { apiBaseUrl: string | undefined; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number }

export async function entryState(kind: EntryKind, rawSlug: string, deps: ExistsDeps): Promise<EntryState> {
  let slug: string;
  try { slug = decodeURIComponent(rawSlug); } catch { return "missing"; }
  if (!looksLikeSlug(slug)) return "missing";
  const base = deps.apiBaseUrl?.replace(/\/+$/, "");
  if (!base) return "unknown";
  const now = (deps.now ?? Date.now)();
  const key = `${kind}:${slug}`;
  const hit = cache.get(key);
  if (hit && hit.until > now) return hit.state;

  let state: EntryState = "unknown";
  try {
    const res = await (deps.fetchImpl ?? fetch)(`${base}/api/v1/${kind}/${encodeURIComponent(slug)}`, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(deps.timeoutMs ?? 3000), cache: "no-store" });
    state = res.status === 200 ? "exists" : res.status === 404 ? "missing" : "unknown";
    void res.body?.cancel().catch(() => {});
  } catch {
    state = "unknown";
  }
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string); // oldest first: the map keeps insertion order
  cache.delete(key);
  cache.set(key, { state, until: now + TTL_MS[state] });
  return state;
}

/** Test hook. */
export const resetEntryCache = () => cache.clear();

/** `/fr/products/<slug>` or `/ht/categories/<slug>` (optional trailing slash) -> what to check; anything else -> null. */
export function catalogPathTarget(pathname: string): { locale: string; kind: EntryKind; slug: string } | null {
  const m = /^\/(fr|ht)\/(products|categories)\/([^/]+)\/?$/.exec(pathname);
  return m ? { locale: m[1], kind: m[2] as EntryKind, slug: m[3] } : null;
}
