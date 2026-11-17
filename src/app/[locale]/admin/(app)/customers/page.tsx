import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CustomerList } from "@/features/admin/customers";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminCustomersPage({ params }: PageProps<"/[locale]/admin/customers">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("admin.customers.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("admin.customers.subtitle")}</p></header>
      <Suspense><CustomerList /></Suspense>
    </>
  );
}
