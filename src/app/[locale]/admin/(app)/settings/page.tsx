import { notFound } from "next/navigation";
import { StoreSettings } from "@/features/admin/store-settings";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminStoreSettingsPage({ params }: PageProps<"/[locale]/admin/settings">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("admin.settings.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("admin.settings.subtitle")}</p></header>
      <StoreSettings />
    </>
  );
}
