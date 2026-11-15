import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmailView } from "@/features/auth/auth-forms";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/verify-email">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.verify.title") } : {};
}

async function Content({ searchParams }: Pick<PageProps<"/[locale]/verify-email">, "searchParams">) {
  const sp = await searchParams;
  const status = sp.status === "success" || sp.status === "error" ? sp.status : "pending";
  const email = typeof sp.email === "string" ? sp.email : undefined;
  return <VerifyEmailView status={status} email={email} />;
}
export default function Page(props: PageProps<"/[locale]/verify-email">) {
  return <Suspense><Content searchParams={props.searchParams} /></Suspense>;
}
