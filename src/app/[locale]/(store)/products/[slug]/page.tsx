import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductPageView } from "@/features/product/product-page-view";
import { isLocale, locales } from "@/i18n/config";

/**
 * One placeholder slug per language gives the route a prerendered shell; every real product renders on demand and is loaded from the API in the
 * browser (no product data is bundled with the app). The page title is set once the product has loaded.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale, slug: "produit" }));
}

export const metadata: Metadata = {};

async function Content({ params }: Pick<PageProps<"/[locale]/products/[slug]">, "params">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  return <ProductPageView slug={decodeURIComponent(slug)} />;
}

export default function ProductPage(props: PageProps<"/[locale]/products/[slug]">) {
  return <Suspense><Content params={props.params} /></Suspense>;
}
