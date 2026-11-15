import type { Metadata } from "next";
import { Suspense } from "react";
import { locales } from "@/i18n/config";
import { CustomerReservationDetail } from "@/features/reservations/track-views";

/** One placeholder reference per language so the route has a prerendered shell; real references render on demand. */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale, reference: "ANA-EXAMPLE" }));
}

export const metadata: Metadata = { robots: { index: false } };

async function Content({ params }: Pick<PageProps<"/[locale]/reservations/[reference]">, "params">) {
  return <CustomerReservationDetail reference={decodeURIComponent((await params).reference)} />;
}

export default function ReservationDetailPage(props: PageProps<"/[locale]/reservations/[reference]">) {
  return (
    <div className="container-page max-w-5xl py-8 sm:py-12">
      <Suspense><Content params={props.params} /></Suspense>
    </div>
  );
}
