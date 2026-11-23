import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-block/shell";
import { Button } from "@/components/auth-block/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/auth-block/ui/card";
import { Link } from "@/i18n/link";
import { type Locale, isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/auth/error">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.error.title"), robots: { index: false, follow: false } } : {};
}

/** Landing page for a failed e-mail link (expired, already used or invalid) or a cancelled/failed social sign-in (`?reason=oauth`). It never reveals why, nor whether an account exists. */
async function Content({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]/auth/error">["searchParams"] }) {
  const { reason } = await searchParams;
  const t = getT(locale);
  const oauth = reason === "oauth"; // a cancelled or failed social sign-in: the link wording would be wrong
  return (
    <AuthShell>
      <Card role="alert">
        <CardHeader>
          <CardTitle>{t(oauth ? "auth.error.oauthTitle" : "auth.error.title")}</CardTitle>
          <CardDescription>{t(oauth ? "auth.error.oauthDescription" : "auth.error.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {reason === "reset"
            ? <Button asChild className="h-auto min-h-11 w-full py-2.5 text-center"><Link href="/auth/forgot-password">{t("auth.error.resetAgain")}</Link></Button>
            : <Button asChild className="h-auto min-h-11 w-full py-2.5 text-center"><Link href="/auth/login">{t(oauth ? "auth.error.oauthAgain" : "auth.error.verifyAgain")}</Link></Button>}
          <Button asChild variant="outline" className="h-auto min-h-11 w-full py-2.5 text-center"><Link href="/">{t("auth.error.backToStore")}</Link></Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

export default async function Page({ params, searchParams }: PageProps<"/[locale]/auth/error">) {
  const { locale } = await params;
  return isLocale(locale) ? <Suspense><Content locale={locale} searchParams={searchParams} /></Suspense> : null;
}
