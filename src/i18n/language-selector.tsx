"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { LOCALE_COOKIE, type Locale, localeNames, locales } from "./config";
import { stripLocale } from "./navigation";
import { useLocale, useT } from "./provider";

/** Cookie write lives outside the component (it is a side effect on the document). */
function persistLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/** Visible FR | KR switch. Remembers the choice in a cookie (read by the proxy on the next visit). */
export function LanguageSelector({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();

  const choose = (next: Locale) => {
    if (next === locale) return;
    persistLocale(next);
    // Read the path at click time: using usePathname() here would make every page wait for the request.
    const rest = stripLocale(window.location.pathname);
    router.replace(`/${next}${rest === "/" ? "" : rest}${window.location.search}${window.location.hash}`);
  };

  const other = locales.find((l) => l !== locale) ?? locale;
  return (
    <>
      {/* Phones: one compact button that switches to the other language (saves header space) */}
      <button
        type="button"
        lang={other}
        onClick={() => choose(other)}
        aria-label={`${t("common.language")} : ${localeNames[other].native}`}
        title={localeNames[other].native}
        className={cn("text-caption min-h-9 min-w-10 rounded-full border border-line-strong bg-surface px-2.5 font-semibold text-ink-soft hover:bg-sand-100 sm:hidden", className)}
      >
        {localeNames[other].short}
      </button>
    <div role="group" aria-label={t("common.language")} className={cn("hidden rounded-full border border-line-strong bg-surface p-0.5 sm:inline-flex", className)}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          onClick={() => choose(l)}
          aria-pressed={l === locale}
          aria-label={localeNames[l].native}
          title={localeNames[l].native}
          className={cn(
            "text-caption min-h-9 min-w-10 rounded-full px-2.5 font-semibold",
            l === locale ? "bg-brand-700 text-white" : "text-ink-soft hover:bg-sand-100 hover:text-ink",
          )}
        >
          {localeNames[l].short}
        </button>
      ))}
    </div>
    </>
  );
}
