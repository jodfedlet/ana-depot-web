import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth/auth-forms";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.forgot.title") } : {};
}

export default function Page() {
  return <ForgotPasswordForm />;
}
