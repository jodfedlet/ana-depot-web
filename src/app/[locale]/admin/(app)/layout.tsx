import { Suspense } from "react";
import { AdminGate } from "@/features/admin/admin-gate";
import { AdminLoading } from "@/features/admin/admin-shell";
import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";

async function Gate({ params, children }: { params: LayoutProps<"/[locale]/admin">["params"]; children: React.ReactNode }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AdminGate locale={locale}>{children}</AdminGate>;
}

/** Everything under /admin (except sign-in) is behind the server-side staff check. */
export default function AdminAppLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Gate params={params}>{children}</Gate>
    </Suspense>
  );
}
