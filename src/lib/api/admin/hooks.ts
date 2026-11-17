"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError } from "../http";
import { useApiResource } from "../use-resource";

/** A staff screen's data: same abort-safe loader as the storefront, so a stale answer can never overwrite a newer one. */
export const useAdminResource = useApiResource;

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Runs ONE write at a time: while a request is pending a second call is refused (no double submit), the error of the last attempt is kept for
 * display, and nothing is reported as done until the server answered. Callers decide what "done" refreshes.
 */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<ActionResult<T>> => {
    if (busy.current) return { ok: false, error: new ApiError({ status: 0, code: "busy" }) };
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      setError(e);
      return { ok: false, error: e };
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { pending, error, run, clear };
}
