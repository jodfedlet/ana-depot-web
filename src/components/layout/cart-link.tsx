"use client";

import { ShoppingBag } from "lucide-react";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { useCart } from "@/lib/stores/cart-store";

export function CartLink() {
  const t = useT();
  const { count, ready } = useCart();
  const shown = ready ? count : 0;
  return (
    <Link href="/cart" aria-label={t("cartLink.label", { count: shown })} className="relative grid size-11 place-items-center rounded-full text-ink hover:bg-sand-100">
      <ShoppingBag aria-hidden className="size-[1.4rem]" />
      {shown > 0 && (
        <span aria-hidden className="absolute right-0.5 top-0.5 grid min-w-[1.125rem] place-items-center rounded-full bg-accent-600 px-1 text-[0.6875rem] font-bold leading-[1.125rem] text-white">
          {shown > 99 ? "99+" : shown}
        </span>
      )}
    </Link>
  );
}
