"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/provider";
import { resendVerification, signIn } from "@/lib/api/auth";
import type { AuthErrorCode } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/safe-next";
import { isValidEmail } from "@/lib/validation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "./primitives";

/**
 * Supabase UI "password-based auth" block: LoginForm. Adapted to this app: strings from the typed i18n dictionaries, locale-aware links and
 * router, errors mapped from Supabase error CODES to fr/ht messages (Supabase's English text is never displayed), the shared Supabase
 * session client (through `lib/api/auth`), our stricter `safeNextPath`, and a resend action when the address is not verified yet.
 */
export function LoginForm({ status }: { status?: "expired" | "signed_out" }) {
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
    setIsLoading(true);
    setError(null);
    setResend("idle");
    const result = await signIn(email, password);
    if (!result.ok) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(safeNextPath(next, "/account"));
    router.refresh(); // server components re-read the new session cookie
  };

  const handleResend = async () => {
    setResend("loading");
    await resendVerification(email, locale); // the answer is deliberately the same whether or not the address exists
    setResend("sent");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.login.title")}</CardTitle>
        <CardDescription>{t("auth.login.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {status === "expired" && <Alert tone="info" className="mb-5">{t("auth.sessionExpired")}</Alert>}
        {status === "signed_out" && <Alert tone="success" live="polite" className="mb-5">{t("auth.signedOut")}</Alert>}
        <form onSubmit={handleLogin} noValidate>
          <div className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("auth.emailPlaceholder")} required
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Link href="/auth/forgot-password" className="text-label font-semibold text-brand-700 underline underline-offset-4">{t("auth.login.forgot")}</Link>
              </div>
              <Input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && (
              <Alert tone="danger" live="assertive" title={t("auth.login.errorTitle")}>
                {t(`auth.errors.${error}`)}
                {error === "email_not_confirmed" && isValidEmail(email) && (
                  <span className="mt-3 block">
                    <Button type="button" size="sm" variant="outline" loading={resend === "loading"} onClick={handleResend}>
                      {resend === "loading" ? t("auth.login.resending") : t("auth.login.resend")}
                    </Button>
                    {resend === "sent" && <span role="status" className="mt-2 block">{t("auth.login.resent")}</span>}
                  </span>
                )}
              </Alert>
            )}
            <Button type="submit" size="lg" full loading={isLoading}>{isLoading ? t("auth.login.submitting") : t("auth.login.submit")}</Button>
          </div>
          <div className="text-label mt-5 text-center font-normal text-ink-soft">
            {t("auth.login.noAccount")}{" "}
            <Link href="/auth/sign-up" className="font-semibold text-brand-700 underline underline-offset-4">{t("auth.login.signUp")}</Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
