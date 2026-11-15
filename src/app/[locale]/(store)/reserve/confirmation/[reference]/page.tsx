import type { Metadata } from "next";
import { Suspense } from "react";
import { locales } from "@/i18n/config";
import { ConfirmationView } from "@/features/reservations/confirmation-view";

/** One placeholder reference per language so the route has a prerendered shell; real references render on demand. */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale, reference: "ANA-EXAMPLE" }));
}

// Static: this route's reference param is unknown at build time, and the page must never be indexed.
export const metadata: Metadata = { robots: { index: false } };

async function Content({ params }: Pick<PageProps<"/[locale]/reserve/confirmation/[reference]">, "params">) {
  return <ConfirmationView reference={decodeURIComponent((await params).reference).toUpperCase()} />;
}

export default function ConfirmationPage(props: PageProps<"/[locale]/reserve/confirmation/[reference]">) {
  return (
    <div className="container-page max-w-4xl py-8 sm:py-12">
      <Suspense><Content params={props.params} /></Suspense>
    </div>
  );
}
