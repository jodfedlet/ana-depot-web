"use client";

import { useState } from "react";
import { Link } from "@/i18n/link";
import { useLocale, useT } from "@/i18n/provider";
import { mapAuthError } from "@/lib/auth/errors";
import { getBrowserClient } from "@/lib/auth/supabase-browser";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/**
 * Official Supabase UI block `password-based-auth-nextjs`: components/forgot-password-form.tsx. Same state, same `supabase.auth.resetPasswordForEmail`
 * call, same success card. Deviations: i18n strings and fr/ht error messages, shared browser client, locale-aware `Link`, and `redirectTo` goes through
 * the locale callback route (which verifies the e-mailed link and then opens /auth/update-password). The confirmation never says whether the address exists.
 */
export function ForgotPasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const t = useT();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getBrowserClient();
    setIsLoading(true);
    setError(null);

    try {
      if (!supabase) throw Object.assign(new Error("not_configured"), { code: "not_configured" });
      // This URL must be in the redirect allow-list of the Supabase project (docs/cloudflare-deployment.md, docs/authentication.md).
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent("/auth/update-password")}`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (error: unknown) {
      setError(t(`auth.errors.${(error as { code?: unknown })?.code === "not_configured" ? "not_configured" : mapAuthError(error)}`));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.forgot.sentTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p role="status" className="text-sm text-muted-foreground">{t("auth.forgot.sentText")}</p>
            <div className="mt-4 text-center text-sm">
              <Link href="/auth/login" className="underline underline-offset-4">{t("auth.forgot.back")}</Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.forgot.title")}</CardTitle>
            <CardDescription>{t("auth.forgot.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="post" onSubmit={handleForgotPassword}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" placeholder={t("auth.emailPlaceholder")} required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                <Link href="/auth/login" className="underline underline-offset-4">{t("auth.forgot.back")}</Link>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
