import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogPage } from "@/features/catalog/catalog-page";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: PageProps<"/[locale]/products">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  // Every query variant (filters, sort, page, `?category=`) canonicalizes to the plain listing; category pages have their own URL (/categories/<slug>).
  return pageMetadata({ locale, path: "/products", title: t("seo.catalogTitle"), description: t("seo.catalogDescription") });
}

export default async function ProductsPage(props: PageProps<"/[locale]/products">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  return <CatalogPage searchParams={props.searchParams} locale={locale} mode="browse" basePath="/products" />;
}
