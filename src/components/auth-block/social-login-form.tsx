"use client";

import { useState } from "react";
import { useLocale, useT } from "@/i18n/provider";
import { mapAuthError } from "@/lib/auth/errors";
import { getBrowserClient } from "@/lib/auth/supabase-browser";
import { safeNextPath } from "@/lib/safe-next-path";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

/**
 * Official Supabase UI block `social-auth-nextjs` (https://supabase.com/ui/r/social-auth-nextjs.json): components/login-form.tsx. Same structure and the same
 * `supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })` call (PKCE); the block ships with `provider: 'github'` and its docs say to switch provider
 * by changing that field, here to 'google'. Deviations: i18n strings, shared browser client, and `redirectTo` goes through the locale callback route (which does the
 * work of the block's app/auth/oauth route) with the official `safeNextPath`.
 */
export function SocialLoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const t = useT();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSocialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getBrowserClient();
    setIsLoading(true);
    setError(null);

    try {
      if (!supabase) throw Object.assign(new Error("not_configured"), { code: "not_configured" });
      const next = new URLSearchParams(window.location.search).get("next");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(safeNextPath(next, "/account"))}` },
      });
      if (error) throw error;
    } catch (error: unknown) {
      setError(t(`auth.errors.${(error as { code?: unknown })?.code === "not_configured" ? "not_configured" : mapAuthError(error)}`));
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>{t("auth.social.title")}</CardTitle>
          <CardDescription>{t("auth.social.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={handleSocialLogin}>
            <div className="flex flex-col gap-6">
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t("auth.social.submitting") : t("auth.social.google")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
