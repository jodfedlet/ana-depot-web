import { notFound } from "next/navigation";
import { NotificationsView } from "@/features/admin/notifications";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminNotificationsPage({ params }: PageProps<"/[locale]/admin/notifications">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("adminNotif.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("adminNotif.subtitle")}</p></header>
      <NotificationsView />
    </>
  );
}
