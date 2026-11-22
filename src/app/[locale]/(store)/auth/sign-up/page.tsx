import type { Metadata } from "next";

import { AuthPage } from "@/components/auth-block/auth-page";
import { SignUpForm } from "@/components/auth-block/sign-up-form";
import { SocialLoginForm } from "@/components/auth-block/social-login-form";
import { enabledOAuthProviders } from "@/lib/auth/oauth-providers";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/auth/sign-up">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.signUp.title"), robots: { index: false, follow: false } } : {};
}

export default async function Page({ params }: PageProps<"/[locale]/auth/sign-up">) {
  const { locale } = await params;
  return isLocale(locale) ? <AuthPage locale={locale}>
      <SignUpForm />
      {enabledOAuthProviders.includes("google") && <SocialLoginForm className="mt-6" />}
    </AuthPage> : null;
}
