"use client";

import { MapPin, Phone } from "lucide-react";
import { infoPages, siteConfig } from "@/config/site";
import { LanguageSelector } from "@/i18n/language-selector";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { pickupAvailability } from "@/lib/pickup/types";
import { usePickup } from "@/lib/stores/pickup-store";
import { useNavItems } from "./use-nav-items";
import { Wordmark } from "./wordmark";

const heading = "text-eyebrow mb-3.5 text-ink-muted";
const linkCls = "text-label font-normal text-ink-soft hover:text-ink hover:underline underline-offset-2 inline-flex min-h-8 items-center";

export function Footer() {
  const t = useT();
  const nav = useNavItems();
  const { settings } = usePickup();
  const loc = settings.location;
  const hasContact = pickupAvailability({ ...settings, enabled: true }) === "available";
  return (
    <footer className="mt-24 border-t border-line bg-sand-50">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="max-w-xs space-y-4 sm:col-span-2 lg:col-span-1">
          <Wordmark />
          <p className="text-label font-normal leading-relaxed text-ink-soft">{t("site.description")}</p>
        </div>
        <nav aria-label={t("footer.shop")}>
          <h2 className={heading}>{t("footer.shop")}</h2>
          <ul className="space-y-2.5">
            {nav.map((i) => <li key={i.href}><Link className={linkCls} href={i.href}>{i.label}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label={t("footer.reservations")}>
          <h2 className={heading}>{t("footer.reservations")}</h2>
          <ul className="space-y-2.5">
            <li><Link className={linkCls} href="/reservations">{t("nav.trackReservation")}</Link></li>
            <li><Link className={linkCls} href="/cart">{t("footer.cart")}</Link></li>
            <li><Link className={linkCls} href="/auth/login">{t("nav.signIn")}</Link></li>
            <li><Link className={linkCls} href="/auth/sign-up">{t("footer.createAccount")}</Link></li>
          </ul>
          <h2 className={`${heading} mt-6`}>{t("footer.help")}</h2>
          <ul className="space-y-2.5">
            {Object.entries(infoPages).map(([slug, page]) => <li key={slug}><Link className={linkCls} href={`/info/${slug}`}>{t(page.key)}</Link></li>)}
          </ul>
        </nav>
        <div>
          <h2 className={heading}>{t("footer.contact")}</h2>
          {hasContact ? (
            <address className="text-label space-y-2 font-normal not-italic text-ink-soft">
              <p className="font-semibold text-ink">{loc.storeName}</p>
              <p className="flex gap-2"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />{loc.addressLine}, {loc.city}</p>
              <p className="flex gap-2"><Phone aria-hidden className="mt-0.5 size-4 shrink-0" /><a href={`tel:${loc.phone.replace(/\s/g, "")}`} className="hover:underline">{loc.phone}</a></p>
            </address>
          ) : (
            <p className="text-label font-normal text-ink-soft">{t("footer.contactPending")}</p>
          )}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-page text-caption flex flex-col gap-3 py-5 text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {siteConfig.name}. {t("site.demoNote")}</p>
          <LanguageSelector />
        </div>
      </div>
    </footer>
  );
}
