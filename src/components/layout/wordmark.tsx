"use client";

import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";

/** Text wordmark (placeholder logo, easy to replace when the identity is final). */
export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  const t = useT();
  return (
    <Link href={href} aria-label={t("nav.homeLink")} className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      {/* the monogram is drawn by CSS (not text in the page): the link's visible text is exactly "Ana Dépôt", so its accessible name can contain it (WCAG 2.5.3 Label in Name) */}
      <span aria-hidden className="grid size-8 place-items-center rounded-md bg-brand-700 font-display text-[0.8rem] font-semibold tracking-tight text-white after:content-['AD']" />
      <span className="whitespace-nowrap font-display text-[1.25rem] leading-none tracking-tight text-ink">Ana Dépôt</span>
    </Link>
  );
}
