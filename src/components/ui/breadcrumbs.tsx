"use client";

import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = useT();
  return (
    <nav aria-label={t("common.breadcrumb")} className="text-caption">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ink-soft">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              <li className="min-w-0">
                {item.href && !last ? (
                  <Link href={item.href} className="underline-offset-2 hover:text-ink hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-ink" : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="text-ink-muted">
                  <ChevronRight className="size-3.5" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
