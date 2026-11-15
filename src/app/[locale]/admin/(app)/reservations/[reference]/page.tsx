import type { Metadata } from "next";
import { Suspense } from "react";
import { locales } from "@/i18n/config";
import { ReservationDetail } from "@/features/admin/reservation-detail";
import { Skeleton } from "@/components/ui/states";

/** One placeholder reference per language so the route has a prerendered shell; real references render on demand. */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale, reference: "ANA-EXAMPLE" }));
}

// Static: the reference is not known at build time (see generateStaticParams above).
export const metadata: Metadata = { title: "Réservation / Rezèvasyon" };

async function Content({ params }: Pick<PageProps<"/[locale]/admin/reservations/[reference]">, "params">) {
  return <ReservationDetail reference={decodeURIComponent((await params).reference)} />;
}

export default function AdminReservationDetailPage(props: PageProps<"/[locale]/admin/reservations/[reference]">) {
  return <Suspense fallback={<Skeleton className="h-96 w-full" />}><Content params={props.params} /></Suspense>;
}
