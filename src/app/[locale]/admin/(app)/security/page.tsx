import { notFound } from "next/navigation";
import { SecurityView } from "@/features/admin/security";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminSecurityPage({ params }: PageProps<"/[locale]/admin/security">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("adminSecurity.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("adminSecurity.subtitle")}</p></header>
      <SecurityView />
    </>
  );
}
