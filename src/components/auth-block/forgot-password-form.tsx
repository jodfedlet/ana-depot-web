"use client";

import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/link";
import { useLocale, useT } from "@/i18n/provider";
import { requestPasswordReset } from "@/lib/api/auth";
import type { AuthErrorCode } from "@/lib/auth/errors";
import { isValidEmail } from "@/lib/validation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, FieldError, Input, Label } from "./primitives";

/** Supabase UI block: ForgotPasswordForm. The confirmation is identical for known and unknown addresses and never echoes the address. */
export function ForgotPasswordForm() {
  const t = useT();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) { setEmailError(t("validation.email")); return; }
    setEmailError(null);
    setIsLoading(true);
    const r = await requestPasswordReset(email, locale);
    setIsLoading(false);
    if (r.ok) setSuccess(true);
    else setError(r.error);
  };

  const back = <Link href="/auth/login" className="font-semibold text-brand-700 underline underline-offset-4">{t("auth.forgot.back")}</Link>;

  if (success) {
    return (
      <Card>
        <CardHeader>
          <MailCheck aria-hidden className="size-10 text-brand-700" />
          <CardTitle>{t("auth.forgot.sentTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="status" className="text-body">{t("auth.forgot.sentText")}</p>
          <p className="text-label mt-5 text-center font-normal">{back}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.forgot.title")}</CardTitle>
        <CardDescription>{t("auth.forgot.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleForgotPassword} noValidate>
          <div className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("auth.emailPlaceholder")} required
                aria-invalid={emailError ? true : undefined} aria-describedby={emailError ? "email-error" : undefined}
                value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(null); }} />
              {emailError && <FieldError id="email-error">{emailError}</FieldError>}
            </div>
            {error && <Alert tone="danger" live="assertive">{t(`auth.errors.${error}`)}</Alert>}
            <Button type="submit" size="lg" full loading={isLoading}>{isLoading ? t("auth.forgot.submitting") : t("auth.forgot.submit")}</Button>
          </div>
          <p className="text-label mt-5 text-center font-normal">{back}</p>
        </form>
      </CardContent>
    </Card>
  );
}
