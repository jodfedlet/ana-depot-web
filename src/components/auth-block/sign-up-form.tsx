"use client";

import { useState } from "react";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/provider";
import { mapAuthError } from "@/lib/auth/errors";
import { getBrowserClient } from "@/lib/auth/supabase-browser";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/** Where the sign-up-success screen finds the address to resend to (this browser tab only; never put an e-mail address in a URL). */
export const PENDING_EMAIL_KEY = "ana.auth.pendingEmail";

/**
 * Official Supabase UI block `password-based-auth-nextjs`: components/sign-up-form.tsx. Same fields (e-mail, password, repeat password), same
 * `supabase.auth.signUp` call, same "passwords do not match" check, same redirect to the sign-up-success page. Deviations, all required by this app:
 *  - i18n strings and fr/ht error messages (mapped from Supabase error codes); shared browser client; locale-aware `Link` / router;
 *  - `emailRedirectTo` goes through the locale callback route, and `options.data.locale` lets the e-mail template pick French or Haitian Creole;
 *  - PRIVACY RULE of this project: an already-registered address ends on the same success screen as a new one (Supabase may answer `user_already_exists`),
 *    so this form never says whether an account exists. The address is kept in sessionStorage for the resend action (a GAP of the block).
 */
export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const t = useT();
  const locale = useLocale();
  const router = useLocaleRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getBrowserClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError(t("validation.passwordMatch"));
      setIsLoading(false);
      return;
    }

    try {
      if (!supabase) throw Object.assign(new Error("not_configured"), { code: "not_configured" });
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent("/account")}`,
          data: { locale },
        },
      });
      const code = (error as { code?: unknown } | null)?.code;
      if (error && code !== "user_already_exists" && code !== "email_exists") throw error;
      try { window.sessionStorage.setItem(PENDING_EMAIL_KEY, email.trim()); } catch { /* private mode: the success screen simply omits the resend button */ }
      router.push("/auth/sign-up-success");
    } catch (error: unknown) {
      setError(t(`auth.errors.${(error as { code?: unknown })?.code === "not_configured" ? "not_configured" : mapAuthError(error)}`));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.signUp.title")}</CardTitle>
          <CardDescription>{t("auth.signUp.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" name="email" type="email" autoComplete="email" placeholder={t("auth.emailPlaceholder")} required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                </div>
                <Input id="password" name="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="repeat-password">{t("auth.repeatPassword")}</Label>
                </div>
                <Input id="repeat-password" name="repeat-password" type="password" autoComplete="new-password" required value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t("auth.signUp.submitting") : t("auth.signUp.submit")}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              {t("auth.signUp.haveAccount")}{" "}
              <Link href="/auth/login" className="underline underline-offset-4">
                {t("auth.signUp.signIn")}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
