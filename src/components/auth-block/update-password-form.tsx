"use client";

import { useState } from "react";
import { useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { mapAuthError } from "@/lib/auth/errors";
import { getBrowserClient } from "@/lib/auth/supabase-browser";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/**
 * Official Supabase UI block `password-based-auth-nextjs`: components/update-password-form.tsx. Same state and the same `supabase.auth.updateUser({ password })`
 * call. It relies on the recovery session that the locale callback route creates from the e-mailed link; without one Supabase answers "session missing", which is
 * shown as the "link invalid or expired" message. Deviations: i18n strings, shared browser client, locale-aware router, `/account` instead of `/protected`.
 */
export function UpdatePasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useLocaleRouter();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getBrowserClient();
    setIsLoading(true);
    setError(null);

    try {
      if (!supabase) throw Object.assign(new Error("not_configured"), { code: "not_configured" });
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // The user already has an active session.
      router.push("/account");
      router.refresh();
    } catch (error: unknown) {
      const code = (error as { code?: unknown })?.code === "not_configured" ? "not_configured" : mapAuthError(error);
      setError(t(`auth.errors.${code === "session_expired" ? "link_expired" : code}`));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.update.title")}</CardTitle>
          <CardDescription>{t("auth.update.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={handleForgotPassword}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">{t("auth.update.label")}</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t("auth.update.submitting") : t("auth.update.submit")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
