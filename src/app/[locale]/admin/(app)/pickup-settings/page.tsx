import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PickupSettingsPage } from "@/features/admin/pickup-settings-form";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/pickup-settings">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("admin.pickupSettings.title") } : {};
}

export default async function AdminPickupSettingsPage({ params }: PageProps<"/[locale]/admin/pickup-settings">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("admin.pickupSettings.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("admin.pickupSettings.subtitle")}</p></header>
      <PickupSettingsPage />
    </>
  );
}
