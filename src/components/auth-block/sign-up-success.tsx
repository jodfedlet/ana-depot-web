"use client";

import { useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/link";
import { useLocale, useT } from "@/i18n/provider";
import { getBrowserClient } from "@/lib/auth/supabase-browser";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PENDING_EMAIL_KEY } from "./sign-up-form";

const readPending = () => { try { return window.sessionStorage.getItem(PENDING_EMAIL_KEY); } catch { return null; } };

/**
 * Official Supabase UI block `password-based-auth-nextjs`: app/auth/sign-up-success/page.tsx (card "Thank you for signing up! / Check your email to confirm").
 * Same card and message, translated. GAP of the block, filled with the documented Supabase call `supabase.auth.resend({ type: "signup" })`: resending the
 * confirmation e-mail. The copy is the same for new and already-registered addresses.
 */
export function SignUpSuccess() {
  const t = useT();
  const locale = useLocale();
  const email = useSyncExternalStore(() => () => {}, readPending, () => null);
  const [state, setState] = useState<"idle" | "loading" | "sent" | "failed">("idle");

  const resend = async () => {
    const supabase = getBrowserClient();
    if (!email || !supabase) return;
    setState("loading");
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent("/account")}` } });
    setState(error ? "failed" : "sent");
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.signUpSuccess.title")}</CardTitle>
          <CardDescription>{t("auth.signUpSuccess.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t("auth.signUpSuccess.text")}</p>
          <p className="text-sm text-muted-foreground">{t("auth.signUpSuccess.alreadyHaveAccount")}</p>
          {email && (
            <div>
              <Button type="button" variant="outline" className="w-full" disabled={state === "loading"} onClick={resend}>
                {state === "loading" ? t("auth.signUpSuccess.resending") : t("auth.signUpSuccess.resend")}
              </Button>
              <p role="status" className="mt-3 min-h-5 text-sm text-muted-foreground">
                {state === "sent" ? t("auth.signUpSuccess.resent") : state === "failed" ? t("auth.signUpSuccess.resendFailed") : ""}
              </p>
            </div>
          )}
          <Button asChild variant="ghost" className="w-full"><Link href="/auth/login">{t("auth.signUpSuccess.backToLogin")}</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
