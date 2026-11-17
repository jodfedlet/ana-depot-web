import { signedInClient } from "../session-client";

/**
 * Every STAFF call goes through here: the Supabase session's access token is forwarded on each request (read fresh), a missing session FAILS with
 * `session_expired` (never an anonymous call), and the backend decides authorization (401 = no valid session, 403 = signed in but not staff).
 */
type Query = Record<string, string | number | boolean | string[] | undefined>;
type Opts = { signal?: AbortSignal; idempotencyKey?: string };

export const adminApi = {
  get: async <T>(path: string, query?: Query, o?: Opts) => (await signedInClient()).get<T>(`/api/v1/admin${path}`, query, { signal: o?.signal }),
  post: async <T>(path: string, body?: unknown, o?: Opts) => (await signedInClient()).post<T>(`/api/v1/admin${path}`, body, { idempotencyKey: o?.idempotencyKey, signal: o?.signal }),
  put: async <T>(path: string, body: unknown, o?: Opts) => (await signedInClient()).put<T>(`/api/v1/admin${path}`, body, { idempotencyKey: o?.idempotencyKey, signal: o?.signal }),
  patch: async <T>(path: string, body: unknown, o?: Opts) => (await signedInClient()).patch<T>(`/api/v1/admin${path}`, body, { idempotencyKey: o?.idempotencyKey, signal: o?.signal }),
  delete: async <T = void>(path: string, o?: Opts) => (await signedInClient()).delete<T>(`/api/v1/admin${path}`, { idempotencyKey: o?.idempotencyKey, signal: o?.signal }),
};
