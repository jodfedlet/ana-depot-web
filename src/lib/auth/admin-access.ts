import { canAccessAdmin } from "./authorization";
import type { Me, MeResult } from "./me";

export type AdminAccess =
  | { state: "not_configured" }
  | { state: "unauthenticated" }
  | { state: "session_invalid" }
  | { state: "backend_unreachable"; email: string }
  | { state: "forbidden"; email: string }
  | { state: "allowed"; me: Me };

export interface AccessDeps {
  configured: boolean;
  /** Verified identity from the auth provider (token validated by Supabase), or null. */
  getVerifiedUser: () => Promise<{ id: string; email: string } | null>;
  getAccessToken: () => Promise<string | null>;
  fetchMe: (accessToken: string) => Promise<MeResult>;
}

/**
 * Decision procedure for protected admin pages. Deny by default: only a verified session whose backend profile says
 * `staff: true` is "allowed". Every failure mode has its own state so the UI can tell the person what happened
 * without revealing anything about the admin area.
 */
export async function resolveAdminAccess(deps: AccessDeps): Promise<AdminAccess> {
  if (!deps.configured) return { state: "not_configured" };
  const user = await deps.getVerifiedUser();
  if (!user) return { state: "unauthenticated" };
  const token = await deps.getAccessToken();
  if (!token) return { state: "session_invalid" };
  const result = await deps.fetchMe(token);
  if (result.kind === "unauthorized") return { state: "session_invalid" };
  if (result.kind === "unreachable") return { state: "backend_unreachable", email: user.email };
  if (result.me.userId !== user.id) return { state: "session_invalid" }; // token and profile must describe the same person
  return canAccessAdmin(result.me) ? { state: "allowed", me: result.me } : { state: "forbidden", email: user.email };
}
