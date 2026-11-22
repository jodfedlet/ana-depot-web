import { Link } from "@/i18n/link";
import { getT } from "@/i18n/server";
import type { Locale } from "@/i18n/config";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

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
        <Button asChild className="h-auto min-h-11 w-full py-2.5 text-center"><Link href="/products">{t("auth.unavailable.shop")}</Link></Button>
        <Button asChild variant="outline" className="h-auto min-h-11 w-full py-2.5 text-center"><Link href="/cart">{t("auth.unavailable.cart")}</Link></Button>
      </CardContent>
    </Card>
  );
}
