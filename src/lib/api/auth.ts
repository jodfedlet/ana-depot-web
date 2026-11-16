import type { SupabaseClient } from "@supabase/supabase-js";
import { type AuthResult, mapAuthError } from "@/lib/auth/errors";
import { getBrowserClient } from "@/lib/auth/supabase-browser";

/**
 * Authentication API used by the screens: thin, real calls to Supabase Auth through the official client.
 * No call here ever "succeeds" on its own — every success is Supabase's answer — and failures are returned as CODES
 * (`AuthErrorCode`) for the UI to translate. Passwords are only ever passed to Supabase; they are not stored or logged.
 */
export type { AuthResult } from "@/lib/auth/errors";

type Locale = string;

export function createAuthApi(getClient: () => SupabaseClient | null, getOrigin: () => string) {
  const callback = (locale: Locale, next: string) => `${getOrigin()}/${locale}/auth/callback?next=${encodeURIComponent(next)}`;
  const run = async <T>(fn: (client: SupabaseClient) => Promise<AuthResult<T>>): Promise<AuthResult<T>> => {
    const client = getClient();
    if (!client) return { ok: false, error: "not_configured" };
    try {
      return await fn(client);
    } catch (e) {
      return { ok: false, error: mapAuthError(e) };
    }
  };

  return {
    signIn: (email: string, password: string) =>
      run(async (c) => {
        const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
        return error ? { ok: false, error: mapAuthError(error) } : { ok: true, data: undefined };
      }),

    /** Creates the account and sends the verification e-mail (if the address is new). `needsVerification` is false only if the project does not require it. */
    register: (input: { firstName: string; lastName: string; email: string; password: string; locale: Locale }) =>
      run<{ needsVerification: boolean }>(async (c) => {
        const { data, error } = await c.auth.signUp({
          email: input.email.trim(),
          password: input.password,
          options: {
            emailRedirectTo: callback(input.locale, "/verify-email?status=success"),
            data: { first_name: input.firstName.trim(), last_name: input.lastName.trim(), locale: input.locale },
          },
        });
        // PRIVACY: an already-registered address must look exactly like a new one. Supabase may answer it with 422 `user_already_exists`
        // (measured on GoTrue v2.184 with confirmations on, for CONFIRMED accounts) or with a user that has no identities (older/obfuscated
        // behavior); both are shown as the same "check your e-mail" screen. Our UI never says whether an account exists.
        if (error) {
          const code = (error as { code?: unknown }).code;
          if (code === "user_already_exists" || code === "email_exists") return { ok: true, data: { needsVerification: true } };
          return { ok: false, error: mapAuthError(error) };
        }
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { ok: true, data: { needsVerification: true } };
        return { ok: true, data: { needsVerification: !data.session } };
      }),

    resendVerification: (email: string, locale: Locale) =>
      run(async (c) => {
        const { error } = await c.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: callback(locale, "/verify-email?status=success") } });
        return error ? { ok: false, error: mapAuthError(error) } : { ok: true, data: undefined };
      }),

    requestPasswordReset: (email: string, locale: Locale) =>
      run(async (c) => {
        const { error } = await c.auth.resetPasswordForEmail(email.trim(), { redirectTo: callback(locale, "/reset-password") });
        return error ? { ok: false, error: mapAuthError(error) } : { ok: true, data: undefined };
      }),

    /** Sets the new password. Needs the recovery session created when the person opened the e-mailed link. */
    resetPassword: (password: string) =>
      run(async (c) => {
        const { data: session } = await c.auth.getSession();
        if (!session.session) return { ok: false, error: "link_expired" };
        const { error } = await c.auth.updateUser({ password });
        return error ? { ok: false, error: mapAuthError(error) } : { ok: true, data: undefined };
      }),
  };
}

const api = createAuthApi(getBrowserClient, () => window.location.origin);
export const { signIn, register, resendVerification, requestPasswordReset, resetPassword } = api;
