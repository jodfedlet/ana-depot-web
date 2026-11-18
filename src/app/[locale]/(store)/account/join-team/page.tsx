import { JoinTeam } from "@/features/account/join-team";
import { getT } from "@/i18n/server";
import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";

export default async function JoinTeamPage({ params }: PageProps<"/[locale]/account/join-team">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <h1 className="text-h1 mb-6">{t("adminTeam.join.title")}</h1>
      <JoinTeam />
    </>
  );
}
