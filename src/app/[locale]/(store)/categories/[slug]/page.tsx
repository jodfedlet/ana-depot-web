import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/states";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { CatalogView } from "@/features/catalog/catalog-view";
import { isLocale, locales } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { loadCategories, loadCategory, loadProductPage } from "@/lib/api/server-catalog";
import { pickText, toCategory } from "@/lib/api/map-catalog";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteOrigin } from "@/lib/seo/site";
import { plainSnippet } from "@/lib/seo/text";

/**
 * Category landing page: a clean, indexable URL per category (`/categories/<slug>`) that lists its products with plain links to each product page. The first page of
 * products is rendered on the server; filters and further pages continue on `/products?category=<slug>` (which canonicalizes to the plain listing). An inactive or unknown
 * category is a real HTTP 404.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale, slug: "categorie" }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/categories/[slug]">): Promise<Metadata> {
  const { locale, slug: raw } = await params;
  if (!isLocale(locale)) return {};
  const loaded = await loadCategory(decodeURIComponent(raw));
  if (loaded.status !== "ok") return { robots: { index: false, follow: false } };
  const category = toCategory(loaded.data, locale);
  const t = getT(locale);
  const description = plainSnippet(category.description, 160) || t("seo.categoryDescription", { name: category.name });
  const image = loaded.data.imageUrl && /^https?:\/\//.test(loaded.data.imageUrl) ? category.image.src : undefined;
  return pageMetadata({ locale, path: `/categories/${loaded.data.slug}`, title: category.name, description, image });
}

async function Content({ params }: Pick<PageProps<"/[locale]/categories/[slug]">, "params">) {
  const { locale, slug: raw } = await params;
  if (!isLocale(locale)) notFound();
  const slug = decodeURIComponent(raw);
  const category = await loadCategory(slug);
  if (category.status === "missing") notFound();
  const t = getT(locale);
  const origin = siteOrigin();
  if (category.status !== "ok") return <CatalogView query={{ category: slug, page: 1 }} mode="browse" basePath="/products" />;
  const [categories, page] = await Promise.all([loadCategories(), loadProductPage({ category: slug, page: 1 })]);
  const initial = { categories: categories.status === "ok" ? categories.data : undefined, page: page.status === "ok" ? page.data : undefined, category: category.data };
  const name = pickText(category.data.name, locale) || category.data.slug;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(locale, [{ name: t("catalog.home"), path: "/" }, { name: t("catalog.shop"), path: "/products" }, { name }], origin)} />
      <CatalogView key={slug} query={{ category: slug, page: 1 }} mode="browse" basePath="/products" initial={initial} />
    </>
  );
}

export default function CategoryPage(props: PageProps<"/[locale]/categories/[slug]">) {
  return <Suspense fallback={<div className="container-page py-8"><Skeleton className="h-96 w-full" /></div>}><Content params={props.params} /></Suspense>;
}
