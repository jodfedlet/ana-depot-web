import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/auth-forms";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/register">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.register.title") } : {};
}

export default function Page() {
  return <RegisterForm />;
}
