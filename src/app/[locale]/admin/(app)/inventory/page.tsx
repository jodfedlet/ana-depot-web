import { notFound } from "next/navigation";
import { Suspense } from "react";
import { InventoryView } from "@/features/admin/inventory";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminInventoryPage({ params }: PageProps<"/[locale]/admin/inventory">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("admin.inventory.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("admin.inventory.subtitle")}</p></header>
      <Suspense><InventoryView /></Suspense>
    </>
  );
}
