import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Dashboard } from "@/features/admin/dashboard";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("admin.dashboard.title") } : {};
}

export default async function AdminDashboardPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6">
        <h1 className="text-h1">{t("admin.dashboard.title")}</h1>
        <p className="text-body mt-1 text-ink-soft">{t("admin.dashboard.subtitle")}</p>
      </header>
      <Suspense><Dashboard /></Suspense>
    </>
  );
}
