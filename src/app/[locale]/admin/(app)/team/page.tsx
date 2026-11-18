import { notFound } from "next/navigation";
import { TeamView } from "@/features/admin/team";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminTeamPage({ params }: PageProps<"/[locale]/admin/team">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("adminTeam.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("adminTeam.subtitle")}</p></header>
      <TeamView />
    </>
  );
}
