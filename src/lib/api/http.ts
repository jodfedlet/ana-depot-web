/**
 * Typed HTTP boundary for the Ana Dépôt API (Spring Boot). The storefront (catalog, search, pickup, reservations, tracking, customer account)
 * goes through it (`lib/api/public.ts`); the administration screens still read browser-local demo stores (out of scope of the storefront phase).
 *
 * Conventions it implements:
 *  - `Authorization: Bearer <Supabase access token>`; the backend validates the token and decides authorization.
 *  - Errors follow RFC 9457 `application/problem+json` with a stable machine-readable `code`.
 *  - `Idempotency-Key` on writes that may be retried (reservation submit, payments, stock adjustments).
 *  - `X-Correlation-Id` on every request so a user action can be traced through frontend, API logs and audit events.
 */
export interface ApiProblem {
  status: number;
  /** Stable code from the API (e.g. `insufficient_stock`, `currency_mismatch`); client-side failures use `network_error` / `timeout` / `invalid_response`. */
  code: string;
  title?: string;
  detail?: string;
  /** Per-field validation problems, when the API sends them. */
  errors?: { field: string; code: string; message?: string }[];
  correlationId?: string;
  /** Seconds to wait before retrying (429/503), from `Retry-After`. */
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  constructor(readonly problem: ApiProblem) {
    super(problem.detail ?? problem.title ?? problem.code);
    this.name = "ApiError";
  }
  /** Transient failures worth retrying; permanent ones (validation, authorization) never are. */
  get retryable(): boolean {
    const { status, code } = this.problem;
    return code === "network_error" || code === "timeout" || status === 429 || status === 502 || status === 503 || status === 504;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  /** Per-attempt timeout; applies even when the caller passes its own abort signal. */
  timeoutMs?: number;
  newId?: () => string;
  /** Extra attempts for an idempotent GET after a transport failure or 502/503/504 (default 2). Writes are NEVER retried here. */
  retries?: number;
  /** Test seams for the backoff. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** Backoff for retry number `attempt` (1-based): exponential from 300 ms, capped at 3 s, with FULL jitter (uniform in [0, cap]) so clients that failed together do not retry together. */
export const backoffDelayMs = (attempt: number, random: () => number = Math.random): number => Math.round(random() * Math.min(3000, 300 * 2 ** (attempt - 1)));
/** What a GET may be retried after: nothing reached the app (network/timeout) or a gateway/availability error. 429 is NOT retried (it would only feed the limiter); 4xx are permanent. */
const retryableForGet = (p: ApiProblem) => p.code === "network_error" || p.code === "timeout" || p.status === 502 || p.status === 503 || p.status === 504;

export const newIdempotencyKey = (): string => crypto.randomUUID();

/** A list value is sent as a repeated parameter (`attr=a:b&attr=c:d`). */
type Query = Record<string, string | number | boolean | string[] | undefined>;
interface WriteOptions { idempotencyKey?: string; signal?: AbortSignal }

export function createApiClient({ baseUrl, getAccessToken, fetchImpl = fetch, timeoutMs = 10_000, newId = () => crypto.randomUUID(), retries = 2, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), random = Math.random }: ApiClientOptions) {
  const root = baseUrl.replace(/\/+$/, "");

  /** One logical call. Only GET is retried (bounded, with jittered backoff); the same correlation id is kept across attempts so the logs show one story. */
  async function request<T>(method: string, path: string, body?: unknown, opts: WriteOptions & { query?: Query } = {}): Promise<T> {
    const maxAttempts = method === "GET" ? 1 + Math.max(0, retries) : 1;
    const correlationId = newId();
    for (let attempt = 1; ; attempt++) {
      try {
        return await attemptOnce<T>(method, path, body, opts, correlationId);
      } catch (e) {
        const p = e instanceof ApiError ? e.problem : null;
        if (attempt >= maxAttempts || !p || !retryableForGet(p) || opts.signal?.aborted) throw e;
        await sleep(backoffDelayMs(attempt, random));
        if (opts.signal?.aborted) throw e;
      }
    }
  }

  async function attemptOnce<T>(method: string, path: string, body: unknown, opts: WriteOptions & { query?: Query }, correlationId: string): Promise<T> {
    const url = new URL(`${root}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
      else if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: "application/json, application/problem+json", "X-Correlation-Id": correlationId };
    const token = await getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    let response: Response;
    try {
      response = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs), cache: "no-store" });
    } catch (e) {
      const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new ApiError({ status: 0, code: timedOut ? "timeout" : "network_error", correlationId });
    }
    const echoed = response.headers.get("x-correlation-id") ?? correlationId;
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      try {
        return (await response.json()) as T;
      } catch {
        throw new ApiError({ status: response.status, code: "invalid_response", correlationId: echoed });
      }
    }
    throw new ApiError(await parseProblem(response, echoed));
  }

  return {
    get: <T>(path: string, query?: Query, o?: { signal?: AbortSignal }) => request<T>("GET", path, undefined, { query, signal: o?.signal }),
    post: <T>(path: string, body: unknown, o?: WriteOptions) => request<T>("POST", path, body, o),
    put: <T>(path: string, body: unknown, o?: WriteOptions) => request<T>("PUT", path, body, o),
    patch: <T>(path: string, body: unknown, o?: WriteOptions) => request<T>("PATCH", path, body, o),
    delete: <T = void>(path: string, o?: WriteOptions) => request<T>("DELETE", path, undefined, o),
  };
}

export async function parseProblem(response: Response, correlationId: string): Promise<ApiProblem> {
  const retryAfter = Number(response.headers.get("retry-after"));
  const base: ApiProblem = { status: response.status, code: `http_${response.status}`, correlationId, ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}) };
  try {
    const raw = (await response.json()) as Record<string, unknown>;
    return {
      ...base,
      code: typeof raw.code === "string" ? raw.code : base.code,
      title: typeof raw.title === "string" ? raw.title : undefined,
      detail: typeof raw.detail === "string" ? raw.detail : undefined,
      errors: Array.isArray(raw.errors) ? raw.errors.filter((e): e is { field: string; code: string; message?: string } => typeof e === "object" && e !== null && typeof (e as { field?: unknown }).field === "string" && typeof (e as { code?: unknown }).code === "string") : undefined,
    };
  } catch {
    return base;
  }
}
