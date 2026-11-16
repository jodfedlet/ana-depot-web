import type { Metadata } from "next";

import { AuthPage } from "@/components/auth-block/auth-page";
import { UpdatePasswordForm } from "@/components/auth-block/update-password-form";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/auth/update-password">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.update.title") } : {};
}

export default async function Page({ params }: PageProps<"/[locale]/auth/update-password">) {
  const { locale } = await params;
  return isLocale(locale) ? <AuthPage locale={locale}><UpdatePasswordForm /></AuthPage> : null;
}
