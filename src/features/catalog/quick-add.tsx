"use client";

import { ShoppingBag } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { buildCartLine } from "@/lib/cart";
import type { Product } from "@/lib/catalog-types";
import { useCart } from "@/lib/stores/cart-store";

/** Card action: add straight to cart, or route to the product page when options must be chosen. */
export function QuickAdd({ product, withOptions }: { product: Product; withOptions: boolean }) {
  const t = useT();
  const cart = useCart();
  const toast = useToast();

  if (withOptions) {
    return (
      <Link href={`/products/${product.slug}`} className={buttonClasses({ variant: "outline", size: "sm", full: true })}>
        {t("product.chooseOptions")}
      </Link>
    );
  }
  if (product.availability === "out_of_stock") {
    return (
      <Button variant="outline" size="sm" full disabled>
        {t("product.soldOut")}
      </Button>
    );
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      full
      aria-label={t("product.addNamed", { name: product.name })}
      onClick={() => {
        cart.add(buildCartLine(product, undefined, product.minOrderQty));
        toast.show({ tone: "success", message: t("product.added", { name: product.name }), action: { label: t("product.viewCart"), href: "/cart" } });
      }}
    >
      <ShoppingBag aria-hidden className="size-4" />
      {t("product.addToCart")}
    </Button>
  );
}
