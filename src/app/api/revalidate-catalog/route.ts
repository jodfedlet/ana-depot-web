import { revalidateTag } from "next/cache";
import { serverApiClient } from "@/lib/api/client";
import type { MeDto } from "@/lib/api/dto";
import { CATALOG_TAG } from "@/lib/api/server-catalog";

/**
 * `POST /api/revalidate-catalog` — staff only. Drops the server-side catalog cache (product/category/listing/sitemap data, see lib/api/server-catalog.ts) so a change made in the
 * administration shows on the storefront on the next visit after the one that triggers the refresh, instead of after the 60 s window.
 *
 * Authorization is the BACKEND's: the caller's bearer token is sent to `GET /api/v1/me` and only `staff: true` proceeds (anything else, including an API that cannot be
 * reached, is refused). No cookie is read and no state is changed other than the cache, so there is nothing for a cross-site request to forge.
 */
export async function POST(request: Request) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return Response.json({ code: "unauthenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const client = serverApiClient(token, { timeoutMs: 5000 });
  if (!client) return Response.json({ code: "api_not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const me = await client.get<MeDto>("/api/v1/me");
    if (!me.staff) return Response.json({ code: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ code: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  // "max" = stale-while-revalidate: the next request after a catalog change is answered with the previous data while the fresh data is fetched, the one after that shows it
  // (verified on Cloudflare Workers with the classic caching model, docs/cloudflare-deployment.md). `{ expire: 0 }` (blocking regeneration) hung there under Cache Components.
  revalidateTag(CATALOG_TAG, "max");
  return Response.json({ revalidated: true }, { headers: { "Cache-Control": "no-store" } });
}
