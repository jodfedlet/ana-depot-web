import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LookupForm } from "@/features/reservations/track-views";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/reservations">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("track.lookup.title"), robots: { index: false } } : {};
}

export default async function ReservationsPage({ params }: PageProps<"/[locale]/reservations">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <div className="container-page py-10 sm:py-14"><LookupForm /></div>;
}
