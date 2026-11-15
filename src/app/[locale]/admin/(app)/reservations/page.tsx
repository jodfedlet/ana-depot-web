import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReservationList } from "@/features/admin/reservation-list";
import { Skeleton } from "@/components/ui/states";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/reservations">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("admin.list.title") } : {};
}

export default async function AdminReservationsPage({ params }: PageProps<"/[locale]/admin/reservations">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("admin.list.title")}</h1></header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}><ReservationList /></Suspense>
    </>
  );
}
