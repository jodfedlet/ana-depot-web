import type { Metadata } from "next";

import { AuthPage } from "@/components/auth-block/auth-page";
import { SignUpSuccess } from "@/components/auth-block/sign-up-success";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/auth/sign-up-success">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.signUpSuccess.title") } : {};
}

export default async function Page({ params }: PageProps<"/[locale]/auth/sign-up-success">) {
  const { locale } = await params;
  return isLocale(locale) ? <AuthPage locale={locale}><SignUpSuccess /></AuthPage> : null;
}
