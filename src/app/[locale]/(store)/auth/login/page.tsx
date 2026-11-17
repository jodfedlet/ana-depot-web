import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestLink } from "@/components/auth-block/guest-link";
import { AuthPage } from "@/components/auth-block/auth-page";
import { LoginForm } from "@/components/auth-block/login-form";
import { getSupabaseConfig } from "@/lib/auth/config";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/auth/login">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.login.title"), robots: { index: false, follow: false } } : {};
}

async function Content({ locale, searchParams }: { locale: "fr" | "ht"; searchParams: PageProps<"/[locale]/auth/login">["searchParams"] }) {
  const { status } = await searchParams;
  return (
    <>
      <AuthPage locale={locale}><LoginForm status={status === "expired" || status === "signed_out" ? status : undefined} /></AuthPage>
      {getSupabaseConfig() && <GuestLink locale={locale} />}
    </>
  );
}

export default async function Page({ params, searchParams }: PageProps<"/[locale]/auth/login">) {
  const { locale } = await params;
  return isLocale(locale) ? <Suspense><Content locale={locale} searchParams={searchParams} /></Suspense> : null;
}
