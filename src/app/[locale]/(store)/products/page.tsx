import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPage } from "@/features/catalog/catalog-page";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/products">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("catalog.allProducts") } : {};
}

export default async function ProductsPage(props: PageProps<"/[locale]/products">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  return <CatalogPage searchParams={props.searchParams} locale={locale} mode="browse" basePath="/products" />;
}
