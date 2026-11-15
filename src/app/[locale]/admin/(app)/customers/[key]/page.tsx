import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/states";
import { CustomerDetail } from "@/features/admin/customers";
import { locales } from "@/i18n/config";

/** One placeholder key per language so the route has a prerendered shell; real keys render on demand. */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale, key: "5090000000" }));
}

export const metadata: Metadata = { title: "Client / Kliyan" };

async function Content({ params }: Pick<PageProps<"/[locale]/admin/customers/[key]">, "params">) {
  return <CustomerDetail keyParam={decodeURIComponent((await params).key)} />;
}

export default function AdminCustomerDetailPage(props: PageProps<"/[locale]/admin/customers/[key]">) {
  return <Suspense fallback={<Skeleton className="h-96 w-full" />}><Content params={props.params} /></Suspense>;
}
