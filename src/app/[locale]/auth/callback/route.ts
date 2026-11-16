import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { isLocale } from "@/i18n/config";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createServerSupabase } from "@/lib/auth/supabase-server";

/**
 * Landing point of the links Supabase e-mails (sign-up verification, password recovery). It exchanges the one-time
 * `code` (PKCE) or `token_hash` for a session stored in cookies, then sends the person to the intended screen.
 * Any failure is shown as an expired/invalid link — never as a success.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return new NextResponse(null, { status: 404 });
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/account");
  const failure = `/auth/error?reason=${next.startsWith("/auth/update-password") ? "reset" : "verify"}`;
  // RELATIVE redirect on purpose: `request.nextUrl.origin` is the server's own hostname (e.g. "localhost" under `next start`), which can differ from
  // the host the browser used ("127.0.0.1", a proxy, a custom domain). Redirecting to another host would drop the session cookie set just above.
  const go = (path: string) => new NextResponse(null, { status: 307, headers: { Location: `/${locale}${path}` } });

  const supabase = await createServerSupabase();
  if (!supabase) return go(failure);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let error: unknown = new Error("missing_params");
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  return go(error ? failure : next);
}
