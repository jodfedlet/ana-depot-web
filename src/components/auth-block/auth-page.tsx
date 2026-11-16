import type { ReactNode } from "react";
import { getSupabaseConfig } from "@/lib/auth/config";
import type { Locale } from "@/i18n/config";
import { AuthUnavailable } from "./auth-unavailable";
import { AuthShell } from "./shell";

/**
 * Every auth route renders through this: when the Supabase configuration is missing or invalid (validated in `lib/auth/config`, logged once on the
 * server as problem codes only) it renders the localized "unavailable" state INSTEAD of the block, so no input, no session and no staff access exist.
 */
export function AuthPage({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <AuthShell>{getSupabaseConfig() ? children : <AuthUnavailable locale={locale} />}</AuthShell>;
}
