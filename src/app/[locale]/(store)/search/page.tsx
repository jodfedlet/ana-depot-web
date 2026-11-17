import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPage } from "@/features/catalog/catalog-page";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/search">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: getT(locale)("catalog.search"), robots: { index: false, follow: false } } : {};
}

export default async function SearchPage(props: PageProps<"/[locale]/search">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  return <CatalogPage searchParams={props.searchParams} locale={locale} mode="search" basePath="/search" />;
}
