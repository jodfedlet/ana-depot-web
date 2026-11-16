/**
 * Where the Ana Dépôt API lives, for the two places that call it:
 *  - SERVER code (Server Components / route handlers: the admin gate asking `GET /api/v1/me`) uses `API_BASE_URL` when set
 *    (e.g. an internal service URL), otherwise the public one.
 *  - BROWSER code (the typed API client in `http.ts`, later screens) can only see `NEXT_PUBLIC_API_BASE_URL`.
 * Both are plain base URLs without a trailing path; the access token always comes from the Supabase session and is never logged.
 * `NEXT_PUBLIC_*` must be referenced literally so Next inlines it into the browser bundle.
 */
export function serverApiBaseUrl(): string | undefined {
  return process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || undefined;
}

export function browserApiBaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_API_BASE_URL || undefined;
}
