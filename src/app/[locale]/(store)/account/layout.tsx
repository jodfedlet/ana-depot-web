import { Suspense } from "react";
import { AccountNav } from "@/features/account/account-views";
import { Skeleton } from "@/components/ui/states";

export default function AccountLayout({ children }: LayoutProps<"/[locale]/account">) {
  return (
    <div className="container-page grid gap-6 py-8 sm:py-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
      <Suspense fallback={<Skeleton className="h-11 w-full lg:h-48" />}><AccountNav /></Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
