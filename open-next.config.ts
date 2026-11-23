import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import doShardedTagCache from "@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache";

/**
 * OpenNext (Cloudflare) cache configuration. The app uses ISR pages, the data cache (`unstable_cache` in src/lib/api/server-catalog.ts) and `revalidateTag`
 * (src/app/api/revalidate-catalog/route.ts), so all three cache parts are required (Cache Components are OFF on purpose, see next.config.ts):
 *  - incremental cache: a PRIVATE R2 bucket (`NEXT_INC_CACHE_R2_BUCKET` in wrangler.jsonc, NOT the product-image bucket). `opennextjs-cloudflare deploy` fills it with the
 *    prerendered output on every deployment and ISR pages are regenerated into it; a Worker deployed without it answers 500 on HTML pages.
 *  - queue: Durable Object queue for time-based revalidation (`revalidate: 60`).
 *  - tag cache: Durable Object tag cache for `revalidateTag` (no D1 database to create).
 * No regional cache and no cache purge: both use the Cloudflare Cache API and need a zone token, which is not required for a correct result.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  queue: doQueue,
  tagCache: doShardedTagCache({ baseShardSize: 4 }),
});
