"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { resetPassword } from "@/lib/api/auth";
import type { AuthErrorCode } from "@/lib/auth/errors";
import { checkPassword } from "@/lib/validation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, FieldError, Input, Label } from "./primitives";

/**
 * Supabase UI block: UpdatePasswordForm. It needs the recovery session created when the e-mailed link was opened (the confirm/callback route
 * verifies the token and sets the session cookie); without one the only way forward is a new link.
 */
export function UpdatePasswordForm() {
  const t = useT();
  const router = useLocaleRouter();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!checkPassword(password).ok) { setPasswordError(t("validation.passwordLength")); return; }
    setPasswordError(null);
    setIsLoading(true);
    const r = await resetPassword(password);
    setIsLoading(false);
    if (r.ok) { router.push("/account"); router.refresh(); return; }
    if (r.error === "link_expired" || r.error === "session_expired") setNoSession(true);
    else setError(r.error);
  };

  if (noSession) {
    return (
      <Card role="alert">
        <CardHeader><CardTitle>{t("auth.update.title")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-body">{t("auth.update.noSession")}</p>
          <ButtonLink href="/auth/forgot-password" full className="h-auto min-h-11 py-2.5 text-center">{t("auth.update.requestNew")}</ButtonLink>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.update.title")}</CardTitle>
        <CardDescription>{t("auth.update.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpdate} noValidate>
          <div className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="password">{t("auth.update.label")}</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required
                aria-invalid={passwordError ? true : undefined} aria-describedby={passwordError ? "password-error" : "password-hint"}
                value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }} />
              {passwordError ? <FieldError id="password-error">{passwordError}</FieldError> : <p id="password-hint" className="text-caption text-ink-muted">{t("auth.passwordHint")}</p>}
            </div>
            {error && <Alert tone="danger" live="assertive" title={t("auth.update.errorTitle")}>{t(`auth.errors.${error}`)}</Alert>}
            <Button type="submit" size="lg" full loading={isLoading}>{isLoading ? t("auth.update.submitting") : t("auth.update.submit")}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
