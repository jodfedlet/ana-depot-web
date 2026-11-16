import { notFound } from "next/navigation";
import { PaymentsView } from "@/features/admin/payments";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminPaymentsViewPage({ params }: PageProps<"/[locale]/admin/payments">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("admin.payments.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("admin.payments.subtitle")}</p></header>
      <PaymentsView />
    </>
  );
}
