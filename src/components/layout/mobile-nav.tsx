"use client";

import { ChevronRight, Menu, PackageSearch, ShoppingBag, User } from "lucide-react";
import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { LanguageSelector } from "@/i18n/language-selector";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { useNavItems } from "./use-nav-items";

export function MobileNav() {
  const t = useT();
  const nav = useNavItems();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const row = "flex min-h-12 items-center justify-between rounded-control px-2 text-[1.0625rem] font-medium text-ink hover:bg-sand-50";
  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-label={t("nav.openMenu")} aria-haspopup="dialog" className="-ml-2 grid size-11 place-items-center rounded-full text-ink hover:bg-sand-100">
        <Menu aria-hidden className="size-6" />
      </button>
      <Drawer open={open} onClose={close} title={t("nav.menu")} side="left">
        <nav aria-label={t("nav.mobile")}>
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={close} className={row}>
                  {item.label}
                  <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
          <hr className="my-3 border-line" />
          <ul>
            <li><Link href="/reservations" onClick={close} className={row}><span className="inline-flex items-center gap-2.5"><PackageSearch aria-hidden className="size-5" /> {t("nav.trackReservation")}</span></Link></li>
            <li><Link href="/account" onClick={close} className={row}><span className="inline-flex items-center gap-2.5"><User aria-hidden className="size-5" /> {t("nav.account")}</span></Link></li>
            <li><Link href="/cart" onClick={close} className={row}><span className="inline-flex items-center gap-2.5"><ShoppingBag aria-hidden className="size-5" /> {t("footer.cart")}</span></Link></li>
          </ul>
          <hr className="my-3 border-line" />
          <div className="px-2"><LanguageSelector /></div>
        </nav>
      </Drawer>
    </div>
  );
}
