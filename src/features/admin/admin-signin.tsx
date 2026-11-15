"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/field";
import { Wordmark } from "@/components/layout/wordmark";
import { LanguageSelector } from "@/i18n/language-selector";
import { useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { signIn } from "@/lib/api/auth";
import type { AuthErrorCode } from "@/lib/auth/errors";
import { getSupabaseConfig } from "@/lib/auth/config";
import { safeNextPath } from "@/lib/auth/safe-next";
import { type Errors, focusFirstInvalid, isBlank, isValidEmail } from "@/lib/validation";

/**
 * Staff sign-in. Authentication is Supabase Auth (the same identity system as customers). Signing in proves WHO you are;
 * whether you may use the administration is decided on the server right after (staff membership in the backend), so a
 * customer who signs in here lands on "access denied". There is no account creation on this page, by design.
 */
export function AdminSignIn({ status }: { status?: "expired" | "signed_out" }) {
  const t = useT();
  const router = useLocaleRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors<"email" | "password">>({});
  const [formError, setFormError] = useState<AuthErrorCode>();
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = t("validation.email");
    if (isBlank(password)) next.password = t("validation.passwordRequired");
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length) { window.setTimeout(() => focusFirstInvalid(formRef.current)); return; }
    setLoading(true);
    const result = await signIn(email, password);
    if (!result.ok) { setFormError(result.error); setLoading(false); return; }
    router.push(safeNextPath(new URLSearchParams(window.location.search).get("next"), "/admin"));
    router.refresh(); // the server now re-checks staff authorization with the new session
  };

  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-sand-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between"><Wordmark href="/" /><LanguageSelector /></div>
        <div className="rounded-card border border-line bg-surface p-6 sm:p-8">
          <h1 className="text-h1">{t("admin.signIn.title")}</h1>
          <p className="text-body mt-1 text-ink-soft">{t("admin.signIn.subtitle")}</p>
          {!getSupabaseConfig() && <Alert tone="danger" className="mt-5" title={t("auth.errors.not_configured")}>{t("auth.errors.not_configured")}</Alert>}
          {status === "expired" && <Alert tone="info" className="mt-5">{t("auth.sessionExpired")}</Alert>}
          {status === "signed_out" && <Alert tone="success" live="polite" className="mt-5">{t("auth.signedOut")}</Alert>}
          <form ref={formRef} onSubmit={submit} noValidate className="mt-6 space-y-5">
            {formError && <Alert tone="danger" live="assertive" title={t("admin.signIn.errorTitle")}>{t(`auth.errors.${formError}`)}</Alert>}
            <TextField label={t("auth.email")} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} error={errors.email} />
            <PasswordField label={t("auth.password")} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }} error={errors.password} />
            <Button type="submit" size="lg" full loading={loading}>{t("admin.signIn.submit")}</Button>
          </form>
          <p className="text-caption mt-5 text-ink-muted">{t("admin.signIn.staffOnly")}</p>
        </div>
        <p className="mt-4 text-center"><ButtonLink href="/" variant="ghost">{t("admin.guard.backToStore")}</ButtonLink></p>
      </div>
    </main>
  );
}
