import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReserveFlow } from "@/features/reservations/reserve-flow";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/reserve">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("reserve.title"), robots: { index: false, follow: false } } : {};
}

export default async function ReservePage({ params }: PageProps<"/[locale]/reserve">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <div className="container-page py-8 sm:py-10">
      <h1 className="text-h1 mb-6">{getT(locale)("reserve.title")}</h1>
      <ReserveFlow />
    </div>
  );
}
