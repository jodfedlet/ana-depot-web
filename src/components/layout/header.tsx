"use client";

import { LanguageSelector } from "@/i18n/language-selector";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { usePaymentCapabilities } from "@/lib/api/payment-capabilities";
import { siteConfig } from "@/config/site";
import { SearchBox } from "@/features/search/search-box";
import { AccountLink } from "./account-link";
import { CartLink } from "./cart-link";
import { MobileNav } from "./mobile-nav";
import { MobileSearch } from "./mobile-search";
import { useNavItems } from "./use-nav-items";
import { Wordmark } from "./wordmark";

export function Header() {
  const t = useT();
  const { mode } = usePaymentCapabilities();   // the announcement states only what the backend says can be paid right now
  const nav = useNavItems();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/85">
      {siteConfig.showAnnouncement && (
        <div className="bg-brand-800 text-white">
          <p className="container-page text-caption flex min-h-9 flex-wrap items-center justify-center gap-x-2 py-1.5 text-center">
            <span>{t(mode === "both" ? "announcement.messageBoth" : mode === "closed" ? "announcement.messageClosed" : "announcement.message")}</span>
            <Link href={siteConfig.announcementHref} className="font-semibold underline underline-offset-2">
              {t("announcement.link")}
            </Link>
          </p>
        </div>
      )}
      <div className="container-page flex h-16 items-center gap-1 sm:gap-3">
        <MobileNav />
        <Wordmark className="mr-auto lg:mr-4" />
        <div className="hidden max-w-md flex-1 lg:block xl:max-w-lg">
          <SearchBox />
        </div>
        <div className="flex items-center gap-1 lg:ml-auto">
          <LanguageSelector className="mr-1" />
          <MobileSearch />
          <AccountLink />
          <CartLink />
        </div>
      </div>
      <nav aria-label={t("nav.main")} className="hidden border-t border-line lg:block">
        <ul className="container-page flex gap-1 overflow-x-auto whitespace-nowrap">
          {nav.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="text-label inline-flex min-h-11 items-center px-3 text-ink-soft hover:text-ink">
                {item.label}
              </Link>
            </li>
          ))}
          <li className="ml-auto shrink-0">
            <Link href="/reservations" className="text-label inline-flex min-h-11 items-center px-3 font-semibold text-brand-700 hover:underline">
              {t("nav.trackReservation")}
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
