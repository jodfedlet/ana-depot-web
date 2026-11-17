import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportsView } from "@/features/admin/reports";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminReportsViewPage({ params }: PageProps<"/[locale]/admin/reports">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("admin.reports.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("admin.reports.subtitle")}</p></header>
      <Suspense><ReportsView /></Suspense>
    </>
  );
}
