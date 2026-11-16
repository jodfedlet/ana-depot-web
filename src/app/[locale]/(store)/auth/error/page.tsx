import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-block/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/auth-block/primitives";
import { ButtonLink } from "@/components/ui/button";
import { type Locale, isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/auth/error">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.error.title") } : {};
}

/** Landing page for a failed e-mail link (expired, already used or invalid). It never reveals why, nor whether an account exists. */
async function Content({ locale, searchParams }: { locale: Locale; searchParams: PageProps<"/[locale]/auth/error">["searchParams"] }) {
  const { reason } = await searchParams;
  const t = getT(locale);
  return (
    <AuthShell>
      <Card role="alert">
        <CardHeader>
          <CardTitle>{t("auth.error.title")}</CardTitle>
          <CardDescription>{t("auth.error.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {reason === "reset"
            ? <ButtonLink href="/auth/forgot-password" full>{t("auth.error.resetAgain")}</ButtonLink>
            : <ButtonLink href="/auth/login" full>{t("auth.error.verifyAgain")}</ButtonLink>}
          <ButtonLink href="/" variant="outline" full>{t("auth.error.backToStore")}</ButtonLink>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

export default async function Page({ params, searchParams }: PageProps<"/[locale]/auth/error">) {
  const { locale } = await params;
  return isLocale(locale) ? <Suspense><Content locale={locale} searchParams={searchParams} /></Suspense> : null;
}
