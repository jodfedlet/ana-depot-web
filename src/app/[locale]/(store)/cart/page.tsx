import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartView } from "@/features/cart/cart-view";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("cart.title"), robots: { index: false, follow: false } } : {};
}

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <div className="container-page py-8 sm:py-10">
      <h1 className="text-h1 mb-6 sm:mb-8">{getT(locale)("cart.title")}</h1>
      <CartView />
    </div>
  );
}
