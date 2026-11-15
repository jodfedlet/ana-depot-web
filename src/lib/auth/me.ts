/**
 * The backend's answer to "who is this token?": `GET {API_BASE_URL}/api/v1/me`.
 * Authentication (Supabase Auth) says WHO someone is; this says what Ana Dépôt lets them do. `staff` is true only for
 * members provisioned in the backend (never derived from user-editable metadata). `permissions` is opaque on purpose:
 * the role model is an open business decision, so the frontend only ever asks the questions in `authorization.ts`.
 */
export interface Me {
  userId: string;
  email: string;
  emailVerified: boolean;
  staff: boolean;
  permissions: string[];
  customerProfileId: string | null;
}

/** Strict parser: anything unexpected is rejected rather than trusted (a malformed body must never grant access). */
export function parseMe(body: unknown): Me | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.userId !== "string" || typeof b.email !== "string") return null;
  if (typeof b.staff !== "boolean" || typeof b.emailVerified !== "boolean") return null;
  if (!Array.isArray(b.permissions) || !b.permissions.every((p) => typeof p === "string")) return null;
  const profile = b.customerProfileId;
  if (profile !== null && profile !== undefined && typeof profile !== "string") return null;
  return { userId: b.userId, email: b.email, emailVerified: b.emailVerified, staff: b.staff, permissions: b.permissions as string[], customerProfileId: (profile as string | null | undefined) ?? null };
}

export type MeResult = { kind: "ok"; me: Me } | { kind: "unauthorized" } | { kind: "unreachable" };

export interface FetchMeOptions {
  apiBaseUrl: string | undefined;
  accessToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Calls the backend. Any failure other than a clean 401 is "unreachable": access is denied, never assumed. */
export async function fetchMe({ apiBaseUrl, accessToken, fetchImpl = fetch, timeoutMs = 5000 }: FetchMeOptions): Promise<MeResult> {
  if (!apiBaseUrl) return { kind: "unreachable" };
  try {
    const response = await fetchImpl(`${apiBaseUrl.replace(/\/+$/, "")}/api/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 || response.status === 403) return { kind: "unauthorized" };
    if (!response.ok) return { kind: "unreachable" };
    const me = parseMe(await response.json());
    return me ? { kind: "ok", me } : { kind: "unreachable" };
  } catch {
    return { kind: "unreachable" };
  }
}
