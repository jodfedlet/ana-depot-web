/**
 * Authentication error CODES (never display text: the UI translates `auth.errors.<code>`).
 * The mapper looks at Supabase's stable `code` first, then at HTTP status, then at the transport failure shape.
 */
export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "already_registered"
  | "weak_password"
  | "same_password"
  | "rate_limited"
  | "network"
  | "session_expired"
  | "link_expired"
  | "not_configured"
  | "unknown";

interface ErrorLike {
  code?: unknown;
  status?: unknown;
  name?: unknown;
  message?: unknown;
}

const BY_CODE: Record<string, AuthErrorCode> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  user_already_exists: "already_registered",
  email_exists: "already_registered",
  weak_password: "weak_password",
  same_password: "same_password",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "rate_limited",
  over_sms_send_rate_limit: "rate_limited",
  session_expired: "session_expired",
  session_not_found: "session_expired",
  refresh_token_not_found: "session_expired",
  refresh_token_already_used: "session_expired",
  bad_jwt: "session_expired",
  otp_expired: "link_expired",
  flow_state_expired: "link_expired",
  flow_state_not_found: "link_expired",
  bad_code_verifier: "link_expired",
};

export function mapAuthError(error: unknown): AuthErrorCode {
  if (error === null || error === undefined) return "unknown";
  const e = error as ErrorLike;
  if (typeof e.code === "string" && BY_CODE[e.code]) return BY_CODE[e.code];
  if (e.status === 429) return "rate_limited";
  // fetch() rejects with a TypeError when the network is down; supabase-js wraps it as AuthRetryableFetchError (status 0)
  if (error instanceof TypeError || e.name === "AuthRetryableFetchError" || e.name === "AuthUnknownError" || e.status === 0) return "network";
  if (e.name === "AuthSessionMissingError") return "session_expired";
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  if (message.includes("invalid login credentials")) return "invalid_credentials";
  if (message.includes("email not confirmed")) return "email_not_confirmed";
  if (message.includes("already registered")) return "already_registered";
  if (message.includes("failed to fetch") || message.includes("network")) return "network";
  return "unknown";
}

export type AuthResult<T = void> = { ok: true; data: T } | { ok: false; error: AuthErrorCode };
