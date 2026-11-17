import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccountGate } from "@/features/account/account-gate";
import { AccountNav } from "@/features/account/account-views";
import { Skeleton } from "@/components/ui/states";
import { isLocale } from "@/i18n/config";

/** The account area belongs to one signed-in person: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function Gate({ params, children }: { params: LayoutProps<"/[locale]/account">["params"]; children: React.ReactNode }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AccountGate locale={locale}>{children}</AccountGate>;
}

export default function AccountLayout({ children, params }: LayoutProps<"/[locale]/account">) {
  return (
    <div className="container-page grid gap-6 py-8 sm:py-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
      <Suspense fallback={<Skeleton className="h-11 w-full lg:h-48" />}><AccountNav /></Suspense>
      <div className="min-w-0">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}><Gate params={params}>{children}</Gate></Suspense>
      </div>
    </div>
  );
}
