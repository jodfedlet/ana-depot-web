"use client";

import { Skeleton } from "@/components/ui/states";
import { useT } from "@/i18n/provider";

export function CatalogSkeleton() {
  const t = useT();
  return (
    <div className="container-page py-8" role="status" aria-label={t("catalog.loading")}>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-6 h-9 w-72" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[15rem_1fr]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/3" />
            </li>
          ))}
        </ul>
      </div>
      <span className="sr-only">{t("catalog.loading")}</span>
    </div>
  );
}
