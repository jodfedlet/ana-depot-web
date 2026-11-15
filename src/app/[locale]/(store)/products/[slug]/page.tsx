import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductPageView } from "@/features/product/product-page-view";
import { isLocale, locales } from "@/i18n/config";
import { getSeedProductName, listSeedSlugs } from "@/lib/api/catalog";

/** Prerenders a shell for the sample products; products the seller adds render on demand from the demo store. */
export function generateStaticParams() {
  return locales.flatMap((locale) => listSeedSlugs().map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/products/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const name = isLocale(locale) ? getSeedProductName(slug, locale) : undefined;
  return name ? { title: name } : {};
}

export default async function ProductPage({ params }: PageProps<"/[locale]/products/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  return <ProductPageView slug={decodeURIComponent(slug)} />;
}
