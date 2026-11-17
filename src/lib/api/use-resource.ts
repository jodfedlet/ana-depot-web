"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

export interface Resource<T> {
  /** The latest successful result. It stays available (stale) while the next one loads, so lists do not flash empty between pages. */
  data: T | undefined;
  /** A request for the CURRENT key is in flight (or has not started). */
  loading: boolean;
  /** Set when the request for the current key failed. */
  error: unknown;
  /** Run the same request again (the "Try again" button). */
  reload: () => void;
}

interface Slot<T> { key: string; tick: number; data?: T; error?: unknown; failed: boolean }

/**
 * Loads `load(signal)` whenever `key` changes (pass `null` to stay idle). A superseded request is aborted and its answer ignored, so a slow
 * response for an old key can never overwrite a newer one. State is only set from the promise callbacks, never synchronously in the effect.
 */
export function useApiResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, initial?: T): Resource<T> {
  // `initial` is the answer for the FIRST `key`, already fetched on the server (the page was server-rendered with it, from a cache that can be up to a minute old): it is
  // shown at once with no loading state, and is then REVALIDATED in the background so a price or stock change is never left on screen. A failed background revalidation keeps
  // the server's answer instead of replacing the page with an error. Any later key, or `reload()`, loads normally.
  const [seed] = useState(() => (initial !== undefined && key !== null ? { key, data: initial } : null));
  const [slot, setSlot] = useState<Slot<T> | null>(() => (seed ? { key: seed.key, tick: 0, data: seed.data, failed: false } : null));
  const [tick, setTick] = useState(0);
  const run = useEffectEvent((signal: AbortSignal) => load(signal));

  useEffect(() => {
    if (key === null) return;
    const silent = seed !== null && seed.key === key && tick === 0;
    const controller = new AbortController();
    run(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setSlot({ key, tick, data, failed: false }); },
      (error: unknown) => { if (!controller.signal.aborted && !silent) setSlot((prev) => ({ key, tick, data: prev?.data, error, failed: true })); },
    );
    return () => controller.abort();
  }, [key, tick, seed]);

  const current = slot !== null && slot.key === key && slot.tick === tick;
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data: slot?.data, loading: key !== null && !current, error: current && slot.failed ? slot.error : undefined, reload };
}
