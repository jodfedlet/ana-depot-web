import type { Metadata } from "next";

import { AuthPage } from "@/components/auth-block/auth-page";
import { ForgotPasswordForm } from "@/components/auth-block/forgot-password-form";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/auth/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.forgot.title"), robots: { index: false, follow: false } } : {};
}

export default async function Page({ params }: PageProps<"/[locale]/auth/forgot-password">) {
  const { locale } = await params;
  return isLocale(locale) ? <AuthPage locale={locale}><ForgotPasswordForm /></AuthPage> : null;
}
