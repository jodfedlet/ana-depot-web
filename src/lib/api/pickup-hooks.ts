"use client";

import { useMemo } from "react";
import type { PickupDto } from "./dto";
import { type PickupView, toPickupView } from "./map-reservation";
import { getPickup } from "./public";
import { useApiResource } from "./use-resource";

const TTL_MS = 30_000;
let cache: { at: number; promise: Promise<PickupDto> } | null = null;
function cachedPickup(): Promise<PickupDto> {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    const promise = getPickup();
    cache = { at: now, promise };
    promise.catch(() => { if (cache?.promise === promise) cache = null; });
  }
  return cache.promise;
}
export const resetPickupCache = () => { cache = null; };

/**
 * The store's pickup information as the API publishes it (`GET /store/pickup`): `available` with the real location and instructions,
 * `disabled` with the owner's message, or `not_configured`. Nothing is hardcoded here: while loading or after a failure `view` is undefined and
 * screens must say so instead of showing an address.
 */
export function usePickupView(): { view: PickupView | undefined; loading: boolean; error: unknown; reload: () => void } {
  const { data, loading, error, reload } = useApiResource("pickup", () => cachedPickup());
  const view = useMemo(() => (data ? toPickupView(data) : undefined), [data]);
  return { view, loading, error, reload };
}
