"use client";

import { Loader2, MailCheck } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/link";
import { useLocale, useT } from "@/i18n/provider";
import { resendVerification } from "@/lib/api/auth";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PENDING_EMAIL_KEY } from "./sign-up-form";

const readPending = () => { try { return window.sessionStorage.getItem(PENDING_EMAIL_KEY); } catch { return null; } };

/** Block page "sign-up-success" (shadcn components in ./ui), with the resend action the block lacks. The copy is the same for new and already-registered addresses. */
export function SignUpSuccess() {
  const t = useT();
  const locale = useLocale();
  const email = useSyncExternalStore(() => () => {}, readPending, () => null);
  const [state, setState] = useState<"idle" | "loading" | "sent" | "failed">("idle");

  const resend = async () => {
    if (!email) return;
    setState("loading");
    const r = await resendVerification(email, locale);
    setState(r.ok ? "sent" : "failed");
  };

  return (
    <Card>
      <CardHeader>
        <MailCheck aria-hidden className="size-10 text-brand-700" />
        <CardTitle>{t("auth.signUpSuccess.title")}</CardTitle>
        <CardDescription>{t("auth.signUpSuccess.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-body">{t("auth.signUpSuccess.text")}</p>
        <p className="text-caption text-ink-soft">{t("auth.signUpSuccess.alreadyHaveAccount")}</p>
        {email && (
          <div>
            <Button type="button" variant="outline" className="w-full" disabled={state === "loading"} aria-busy={state === "loading" || undefined} onClick={resend}>
              {state === "loading" && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {state === "loading" ? t("auth.signUpSuccess.resending") : t("auth.signUpSuccess.resend")}
            </Button>
            <p role="status" className="text-label mt-3 min-h-5 font-normal text-ink-soft">
              {state === "sent" ? t("auth.signUpSuccess.resent") : state === "failed" ? t("auth.signUpSuccess.resendFailed") : ""}
            </p>
          </div>
        )}
        <Button asChild variant="ghost" className="w-full"><Link href="/auth/login">{t("auth.signUpSuccess.backToLogin")}</Link></Button>
      </CardContent>
    </Card>
  );
}
