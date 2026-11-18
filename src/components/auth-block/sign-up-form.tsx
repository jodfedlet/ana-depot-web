"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/provider";
import { register } from "@/lib/api/auth";
import type { AuthErrorCode } from "@/lib/auth/errors";
import { checkPassword, isValidEmail } from "@/lib/validation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, FieldError, Input, Label } from "./primitives";

/** Where the sign-up-success screen finds the address to resend to (this browser tab only; never put an e-mail address in a URL). */
export const PENDING_EMAIL_KEY = "ana.auth.pendingEmail";

/**
 * Supabase UI "password-based auth" block: SignUpForm. Privacy: an already-registered address ends on EXACTLY the same success screen as a
 * new one (`lib/api/auth` treats "user already exists" as success), so this form never says whether an account exists.
 */
export function SignUpForm() {
  const t = useT();
  const locale = useLocale();
  const router = useLocaleRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; repeat?: string }>({});
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const next: typeof fieldErrors = {};
    if (!isValidEmail(email)) next.email = t("validation.email");
    if (!checkPassword(password).ok) next.password = t("validation.passwordLength");
    if (repeatPassword !== password) next.repeat = t("validation.passwordMatch");
    setFieldErrors(next);
    if (Object.keys(next).length) return;
    setIsLoading(true);
    const result = await register({ email, password, locale });
    if (!result.ok) {
      setError(result.error);
      setIsLoading(false);
      return;
    }
    if (!result.data.needsVerification) {
      router.push("/account"); // the project does not require verification: the session already exists
      router.refresh();
      return;
    }
    try { window.sessionStorage.setItem(PENDING_EMAIL_KEY, email.trim()); } catch { /* private mode: the success screen simply omits the resend button */ }
    router.push("/auth/sign-up-success");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.signUp.title")}</CardTitle>
        <CardDescription>{t("auth.signUp.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" onSubmit={handleSignUp} noValidate>
          <div className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder={t("auth.emailPlaceholder")} required
                aria-invalid={fieldErrors.email ? true : undefined} aria-describedby={fieldErrors.email ? "email-error" : undefined}
                value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors((x) => ({ ...x, email: undefined })); }} />
              {fieldErrors.email && <FieldError id="email-error">{fieldErrors.email}</FieldError>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required
                aria-invalid={fieldErrors.password ? true : undefined} aria-describedby={fieldErrors.password ? "password-error" : "password-hint"}
                value={password} onChange={(e) => { setPassword(e.target.value); setFieldErrors((x) => ({ ...x, password: undefined })); }} />
              {fieldErrors.password ? <FieldError id="password-error">{fieldErrors.password}</FieldError> : <p id="password-hint" className="text-caption text-ink-muted">{t("auth.passwordHint")}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="repeat-password">{t("auth.repeatPassword")}</Label>
              <Input id="repeat-password" name="repeat-password" type="password" autoComplete="new-password" required
                aria-invalid={fieldErrors.repeat ? true : undefined} aria-describedby={fieldErrors.repeat ? "repeat-error" : undefined}
                value={repeatPassword} onChange={(e) => { setRepeatPassword(e.target.value); setFieldErrors((x) => ({ ...x, repeat: undefined })); }} />
              {fieldErrors.repeat && <FieldError id="repeat-error">{fieldErrors.repeat}</FieldError>}
            </div>
            {error && <Alert tone="danger" live="assertive" title={t("auth.signUp.errorTitle")}>{t(`auth.errors.${error}`)}</Alert>}
            <Button type="submit" size="lg" full loading={isLoading}>{isLoading ? t("auth.signUp.submitting") : t("auth.signUp.submit")}</Button>
          </div>
          <div className="text-label mt-5 text-center font-normal text-ink-soft">
            {t("auth.signUp.haveAccount")}{" "}
            <Link href="/auth/login" className="font-semibold text-brand-700 underline underline-offset-4">{t("auth.signUp.signIn")}</Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
