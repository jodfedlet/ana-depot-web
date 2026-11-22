"use client";

import { useState } from "react";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/provider";
import { type AuthErrorCode, mapAuthError } from "@/lib/auth/errors";
import { getBrowserClient } from "@/lib/auth/supabase-browser";
import { safeNextPath } from "@/lib/safe-next-path";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/**
 * Official Supabase UI block `password-based-auth-nextjs` (https://supabase.com/ui/r/password-based-auth-nextjs.json): components/login-form.tsx.
 * Same structure, state and `supabase.auth.signInWithPassword` call as the registry file. Deviations, all required by this app:
 *  - strings come from the app's i18n dictionaries (the block has no localization mechanism); the error is a Supabase error CODE mapped to a fr/ht message;
 *  - the shared browser client (`getBrowserClient`) instead of the registry's `createClient`; locale-aware `Link` / router; `/account` instead of `/protected`;
 *  - GAPS of the block (no official equivalent): `status` banners after sign-out / session expiry, and "resend" for an unverified address (`supabase.auth.resend`).
 */
export function LoginForm({ className, status, ...props }: React.ComponentPropsWithoutRef<"div"> & { status?: "expired" | "signed_out" }) {
  const t = useT();
  const locale = useLocale();
  const router = useLocaleRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resend, setResend] = useState<"idle" | "loading" | "sent">("idle");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getBrowserClient();
    setIsLoading(true);
    setError(null);
    setResend("idle");

    try {
      if (!supabase) throw Object.assign(new Error("not_configured"), { code: "not_configured" });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // The user already has an active session: go to the intended destination.
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(safeNextPath(next, "/account"));
      router.refresh(); // server components re-read the new session cookie
    } catch (error: unknown) {
      setError((error as { code?: unknown })?.code === "not_configured" ? "not_configured" : mapAuthError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    setResend("loading");
    // Same answer whether or not the address exists (no account-existence disclosure).
    await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent("/account")}` } });
    setResend("sent");
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.login.title")}</CardTitle>
          <CardDescription>{t("auth.login.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {status && <p role="status" className="mb-4 text-sm text-muted-foreground">{status === "expired" ? t("auth.sessionExpired") : t("auth.signedOut")}</p>}
          <form method="post" onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" name="email" type="email" autoComplete="email" placeholder={t("auth.emailPlaceholder")} required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Link href="/auth/forgot-password" className="ml-auto inline-block text-sm underline-offset-4 hover:underline">
                    {t("auth.login.forgot")}
                  </Link>
                </div>
                <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{t(`auth.errors.${error}`)}</p>}
              {error === "email_not_confirmed" && (
                <div>
                  <Button type="button" variant="outline" size="sm" disabled={resend === "loading"} onClick={handleResend}>
                    {resend === "loading" ? t("auth.login.resending") : t("auth.login.resend")}
                  </Button>
                  {resend === "sent" && <p role="status" className="mt-2 text-sm text-muted-foreground">{t("auth.login.resent")}</p>}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t("auth.login.submitting") : t("auth.login.submit")}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              {t("auth.login.noAccount")}{" "}
              <Link href="/auth/sign-up" className="underline underline-offset-4">
                {t("auth.login.signUp")}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
