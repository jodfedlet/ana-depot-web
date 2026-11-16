import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import type { Locale } from "@/i18n/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./primitives";

/**
 * Rendered by every auth route when the Supabase configuration is missing or invalid. It has NO inputs, creates no session,
 * simulates nothing and grants nothing. Guests can keep shopping and reserving (those flows never need an account).
 */
export function AuthUnavailable({ locale }: { locale: Locale }) {
  const t = getT(locale);
  return (
    <Card role="status">
      <CardHeader>
        <CardTitle>{t("auth.unavailable.title")}</CardTitle>
        <CardDescription>{t("auth.unavailable.text")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ButtonLink href="/products" full>{t("auth.unavailable.shop")}</ButtonLink>
        <ButtonLink href="/cart" variant="outline" full>{t("auth.unavailable.cart")}</ButtonLink>
      </CardContent>
    </Card>
  );
}
