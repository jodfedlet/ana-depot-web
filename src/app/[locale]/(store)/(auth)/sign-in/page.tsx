import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/features/auth/auth-forms";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("auth.signIn.title") } : {};
}

async function Content({ searchParams }: Pick<PageProps<"/[locale]/sign-in">, "searchParams">) {
  const { status } = await searchParams;
  return <SignInForm status={status === "expired" || status === "signed_out" ? status : undefined} />;
}

export default function Page(props: PageProps<"/[locale]/sign-in">) {
  return <Suspense><Content searchParams={props.searchParams} /></Suspense>;
}
