"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";

/** `hrefs[i]` is the link for page i + 1. Strings only: this component receives them from a Server Component. */
export function Pagination({ page, pageCount, hrefs }: { page: number; pageCount: number; hrefs: string[] }) {
  const hrefFor = (p: number) => hrefs[p - 1];
  const t = useT();
  if (pageCount <= 1) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  const item = "text-label grid min-h-11 min-w-11 place-items-center rounded-control px-2";
  return (
    <nav aria-label={t("catalog.pagination")} className="mt-12 flex items-center justify-center gap-1">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} rel="prev" className={cn(item, "hover:bg-sand-100")}>
          <span className="inline-flex items-center gap-1"><ChevronLeft aria-hidden className="size-4" />{t("catalog.previous")}</span>
        </Link>
      )}
      {pages.map((p) => (
        <Link key={p} href={hrefFor(p)} aria-label={t("catalog.page", { n: p })} aria-current={p === page ? "page" : undefined} className={cn(item, p === page ? "bg-brand-700 font-semibold text-white" : "hover:bg-sand-100")}>
          {p}
        </Link>
      ))}
      {page < pageCount && (
        <Link href={hrefFor(page + 1)} rel="next" className={cn(item, "hover:bg-sand-100")}>
          <span className="inline-flex items-center gap-1">{t("catalog.next")}<ChevronRight aria-hidden className="size-4" /></span>
        </Link>
      )}
    </nav>
  );
}
