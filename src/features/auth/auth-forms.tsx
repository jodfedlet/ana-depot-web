"use client";

import { CheckCircle2, MailCheck, TriangleAlert } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/field";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/provider";
import { register, requestPasswordReset, resendVerification, resetPassword, signIn } from "@/lib/api/auth";
import type { AuthErrorCode } from "@/lib/auth/errors";
import { getSupabaseConfig } from "@/lib/auth/config";
import { safeNextPath } from "@/lib/auth/safe-next";
import { type Errors, checkPassword, focusFirstInvalid, isBlank, isValidEmail } from "@/lib/validation";

const linkCls = "font-semibold text-brand-700 underline underline-offset-2";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <h1 className="text-h1 text-center">{title}</h1>
      {subtitle && <p className="text-body mt-2 text-center text-ink-soft">{subtitle}</p>}
      <div className="mt-8 rounded-card border border-line bg-surface p-5 sm:p-7">{children}</div>
      {footer && <p className="text-label mt-6 text-center font-normal text-ink-soft">{footer}</p>}
    </div>
  );
}

/** Post-sign-in destination from `?next=` (same-site relative paths only). */
export function nextFromLocation(fallback = "/account"): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"), fallback);
}

/** Shown on every auth screen when the project has no Supabase configuration: no flow pretends to work. */
function NotConfigured() {
  const t = useT();
  if (getSupabaseConfig()) return null;
  return <Alert tone="danger" className="mb-5">{t("auth.errors.not_configured")}</Alert>;
}

/** The message for an auth failure code. */
function useAuthError() {
  const t = useT();
  return (code: AuthErrorCode) => t(`auth.errors.${code}`);
}

export function SignInForm({ afterSignIn = "/account", status }: { afterSignIn?: string; status?: "expired" | "signed_out" }) {
  const t = useT();
  const locale = useLocale();
  const authError = useAuthError();
  const router = useLocaleRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors<"email" | "password">>({});
  const [formError, setFormError] = useState<AuthErrorCode>();
  const [loading, setLoading] = useState(false);
  const [resend, setResend] = useState<"idle" | "loading" | "sent" | "failed">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = t("validation.email");
    if (isBlank(password)) next.password = t("validation.passwordRequired");
    setErrors(next);
    setFormError(undefined);
    setResend("idle");
    if (Object.keys(next).length) { window.setTimeout(() => focusFirstInvalid(formRef.current)); return; }
    setLoading(true);
    const result = await signIn(email, password);
    if (!result.ok) { setFormError(result.error); setLoading(false); return; }
    router.push(nextFromLocation(afterSignIn));
    router.refresh(); // server components re-read the new session cookie
  };

  const resendVerification_ = async () => {
    setResend("loading");
    const r = await resendVerification(email, locale);
    setResend(r.ok ? "sent" : "failed");
  };

  return (
    <AuthCard title={t("auth.signIn.title")} subtitle={t("auth.signIn.subtitle")} footer={<>{t("auth.signIn.newHere")} <Link href="/register" className={linkCls}>{t("auth.signIn.create")}</Link></>}>
      <NotConfigured />
      {status === "expired" && <Alert tone="info" className="mb-5">{t("auth.sessionExpired")}</Alert>}
      {status === "signed_out" && <Alert tone="success" live="polite" className="mb-5">{t("auth.signedOut")}</Alert>}
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
        {formError && (
          <Alert tone="danger" live="assertive" title={t("auth.signIn.errorTitle")}>
            {authError(formError)}
            {formError === "email_not_confirmed" && isValidEmail(email) && (
              <span className="mt-3 block">
                <Button type="button" size="sm" variant="outline" loading={resend === "loading"} onClick={resendVerification_}>{t("auth.verify.resendFull")}</Button>
                {resend === "sent" && <span role="status" className="mt-2 block">{t("auth.verify.requested")}</span>}
                {resend === "failed" && <span role="alert" className="mt-2 block">{t("auth.verify.failed")}</span>}
              </span>
            )}
          </Alert>
        )}
        <TextField label={t("auth.email")} type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} error={errors.email} />
        <div>
          <PasswordField label={t("auth.password")} name="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }} error={errors.password} />
          <Link href="/forgot-password" className="text-caption mt-2 inline-flex min-h-8 items-center font-semibold text-brand-700 underline underline-offset-2">{t("auth.signIn.forgot")}</Link>
        </div>
        <Button type="submit" size="lg" full loading={loading}>{t("auth.signIn.submit")}</Button>
      </form>
      <div className="mt-6 border-t border-line pt-5 text-center">
        <p className="text-label font-normal text-ink-soft">{t("auth.signIn.guestText")}</p>
        <ButtonLink href="/cart" variant="outline" full className="mt-3">{t("auth.signIn.guestButton")}</ButtonLink>
      </div>
    </AuthCard>
  );
}

export function RegisterForm() {
  const t = useT();
  const locale = useLocale();
  const authError = useAuthError();
  const router = useLocaleRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [v, setV] = useState({ firstName: "", lastName: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors<keyof typeof v>>({});
  const [formError, setFormError] = useState<AuthErrorCode>();
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (isBlank(v.firstName)) next.firstName = t("validation.firstName");
    if (isBlank(v.lastName)) next.lastName = t("validation.lastName");
    if (!isValidEmail(v.email)) next.email = t("validation.email");
    if (!checkPassword(v.password).ok) next.password = t("validation.passwordLength");
    if (v.confirm !== v.password) next.confirm = t("validation.passwordMatch");
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length) { window.setTimeout(() => focusFirstInvalid(formRef.current)); return; }
    setLoading(true);
    const result = await register({ firstName: v.firstName, lastName: v.lastName, email: v.email, password: v.password, locale });
    if (!result.ok) { setFormError(result.error); setLoading(false); return; }
    // Only claim "check your e-mail" when Supabase says verification is required; otherwise the account is already active.
    if (result.data.needsVerification) router.push(`/verify-email?email=${encodeURIComponent(v.email.trim())}`);
    else { router.push("/account"); router.refresh(); }
  };

  return (
    <AuthCard title={t("auth.register.title")} subtitle={t("auth.register.subtitle")} footer={<>{t("auth.register.have")} <Link href="/sign-in" className={linkCls}>{t("auth.signIn.title")}</Link></>}>
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        <NotConfigured />
        {formError && (
          <Alert tone="danger" live="assertive" title={t("auth.register.errorTitle")}>
            {authError(formError)}
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("auth.register.firstName")} autoComplete="given-name" value={v.firstName} onChange={set("firstName")} error={errors.firstName} />
          <TextField label={t("auth.register.lastName")} autoComplete="family-name" value={v.lastName} onChange={set("lastName")} error={errors.lastName} />
        </div>
        <TextField label={t("auth.email")} type="email" autoComplete="email" inputMode="email" value={v.email} onChange={set("email")} error={errors.email} />
        <PasswordField label={t("auth.password")} autoComplete="new-password" hint={t("auth.passwordHint")} value={v.password} onChange={set("password")} error={errors.password} />
        <PasswordField label={t("auth.register.confirm")} autoComplete="new-password" value={v.confirm} onChange={set("confirm")} error={errors.confirm} />
        <Button type="submit" size="lg" full loading={loading}>{t("auth.register.submit")}</Button>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordForm() {
  const t = useT();
  const locale = useLocale();
  const authError = useAuthError();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) { setError(t("validation.email")); window.setTimeout(() => focusFirstInvalid(formRef.current)); return; }
    setError(undefined);
    setLoading(true);
    const r = await requestPasswordReset(email, locale);
    setLoading(false);
    if (!r.ok) { setError(authError(r.error)); return; }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthCard title={t("auth.forgot.sentTitle")} footer={<Link href="/sign-in" className={linkCls}>{t("auth.forgot.back")}</Link>}>
        <div role="status" className="text-center">
          <MailCheck aria-hidden className="mx-auto size-10 text-brand-700" />
          <p className="text-body mt-4">{t("auth.forgot.sentText", { email })}</p>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")} footer={<Link href="/sign-in" className={linkCls}>{t("auth.forgot.back")}</Link>}>
      <NotConfigured />
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
        <TextField label={t("auth.email")} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} error={error} />
        <Button type="submit" size="lg" full loading={loading}>{t("auth.forgot.submit")}</Button>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordForm({ expired: initiallyExpired = false }: { expired?: boolean }) {
  const t = useT();
  const authError = useAuthError();
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors<"password" | "confirm">>({});
  const [formError, setFormError] = useState<AuthErrorCode>();
  const [expired, setExpired] = useState(initiallyExpired);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (expired) {
    return (
      <AuthCard title={t("auth.reset.expiredTitle")}>
        <div role="alert" className="text-center">
          <TriangleAlert aria-hidden className="mx-auto size-10 text-warning-fg" />
          <p className="text-body mt-4">{t("auth.reset.expiredText")}</p>
          <ButtonLink href="/forgot-password" size="lg" full className="mt-6">{t("auth.reset.request")}</ButtonLink>
        </div>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard title={t("auth.reset.doneTitle")}>
        <div role="status" className="text-center">
          <CheckCircle2 aria-hidden className="mx-auto size-10 text-success-fg" />
          <p className="text-body mt-4">{t("auth.reset.doneText")}</p>
          <ButtonLink href="/account" size="lg" full className="mt-6">{t("auth.verify.continueAccount")}</ButtonLink>
        </div>
      </AuthCard>
    );
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!checkPassword(password).ok) next.password = t("validation.passwordLength");
    if (confirm !== password) next.confirm = t("validation.passwordMatch");
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length) { window.setTimeout(() => focusFirstInvalid(formRef.current)); return; }
    setLoading(true);
    const r = await resetPassword(password);
    setLoading(false);
    if (r.ok) { setDone(true); return; }
    // No recovery session (link opened elsewhere, used twice or expired): the only way forward is a new link.
    if (r.error === "link_expired" || r.error === "session_expired") setExpired(true);
    else setFormError(r.error);
  };
  return (
    <AuthCard title={t("auth.reset.title")}>
      <NotConfigured />
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
        {formError && <Alert tone="danger" live="assertive" title={t("auth.reset.errorTitle")}>{authError(formError)}</Alert>}
        <PasswordField label={t("auth.reset.newPassword")} autoComplete="new-password" hint={t("auth.passwordHint")} value={password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }} error={errors.password} />
        <PasswordField label={t("auth.reset.confirm")} autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined })); }} error={errors.confirm} />
        <Button type="submit" size="lg" full loading={loading}>{t("auth.reset.submit")}</Button>
      </form>
    </AuthCard>
  );
}

export function VerifyEmailView({ email: knownEmail, status }: { email?: string; status: "pending" | "success" | "error" }) {
  const t = useT();
  const locale = useLocale();
  const authError = useAuthError();
  const [typedEmail, setTypedEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "failed">("idle");
  const [failure, setFailure] = useState<AuthErrorCode>();
  const email = knownEmail ?? typedEmail;
  const resend = async () => {
    if (!isValidEmail(email)) { setState("failed"); setFailure(undefined); return; }
    setState("loading");
    const r = await resendVerification(email, locale);
    setFailure(r.ok ? undefined : r.error);
    setState(r.ok ? "sent" : "failed");
  };
  const emailField = !knownEmail && (
    <div className="mt-6 text-left"><TextField label={t("auth.email")} type="email" autoComplete="email" inputMode="email" value={typedEmail} onChange={(e) => setTypedEmail(e.target.value)} /></div>
  );
  const feedback = (
    <p role="status" className="text-label mt-3 min-h-5 font-normal text-ink-soft">
      {state === "sent" ? t("auth.verify.requested") : state === "failed" ? (failure ? authError(failure) : t("auth.verify.failed")) : ""}
    </p>
  );
  if (status === "success") {
    return (
      <AuthCard title={t("auth.verify.successTitle")}>
        <div role="status" className="text-center">
          <CheckCircle2 aria-hidden className="mx-auto size-10 text-success-fg" />
          <p className="text-body mt-4">{t("auth.verify.successText")}</p>
          <ButtonLink href="/account" size="lg" full className="mt-6">{t("auth.verify.continueAccount")}</ButtonLink>
          <ButtonLink href="/sign-in" variant="ghost" full className="mt-2">{t("auth.verify.signIn")}</ButtonLink>
        </div>
      </AuthCard>
    );
  }
  if (status === "error") {
    return (
      <AuthCard title={t("auth.verify.errorTitle")}>
        <div role="alert" className="text-center">
          <TriangleAlert aria-hidden className="mx-auto size-10 text-warning-fg" />
          <p className="text-body mt-4">{t("auth.verify.errorText")}</p>
        </div>
        {emailField}
        <div className="text-center">
          <Button size="lg" full className="mt-6" loading={state === "loading"} onClick={resend}>{t("auth.verify.resendFull")}</Button>
          {feedback}
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("auth.verify.title")} footer={<Link href="/sign-in" className={linkCls}>{t("auth.verify.continueSignIn")}</Link>}>
      <div className="text-center">
        <MailCheck aria-hidden className="mx-auto size-10 text-brand-700" />
        <p className="text-body mt-4">{knownEmail ? t("auth.verify.sendText", { email: knownEmail }) : t("auth.verify.sendTextNoEmail")}</p>
        <p className="text-caption mt-2 text-ink-soft">{t("auth.verify.alreadyHaveAccount")}</p>
      </div>
      {emailField}
      <div className="text-center">
        <Button variant="outline" size="lg" full className="mt-6" loading={state === "loading"} onClick={resend}>{t("auth.verify.resend")}</Button>
        {feedback}
      </div>
    </AuthCard>
  );
}
