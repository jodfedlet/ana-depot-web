import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/auth-forms";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.reset.title") } : {};
}

async function Content({ searchParams }: Pick<PageProps<"/[locale]/reset-password">, "searchParams">) {
  const { status } = await searchParams;
  return <ResetPasswordForm expired={status === "expired"} />;
}
export default function Page(props: PageProps<"/[locale]/reset-password">) {
  return <Suspense><Content searchParams={props.searchParams} /></Suspense>;
}
