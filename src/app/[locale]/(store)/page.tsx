import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/states";
import { JsonLd } from "@/components/seo/json-ld";
import { Benefits, HomeCatalogSections, Hero } from "@/features/home/sections";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";
import type { CatalogInitial } from "@/lib/api/catalog-hooks";
import { loadCategories, loadProductPage } from "@/lib/api/server-catalog";
import { HOME_QUERY } from "@/lib/catalog-query";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteOrigin } from "@/lib/seo/site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  // The home title is the site name alone (the root template would repeat it).
  return { ...pageMetadata({ locale, path: "/", title: "Ana Dépôt", description: t("site.description") }), title: { absolute: "Ana Dépôt" } };
}

/** The home merchandising (categories + latest products) is fetched on the server so the first HTML already contains it; on any problem the browser loads it as before. */
async function homeInitial(): Promise<CatalogInitial | undefined> {
  try {
    const [categories, page] = await Promise.all([loadCategories(), loadProductPage(HOME_QUERY, HOME_QUERY.pageSize)]);
    return categories.status === "ok" && page.status === "ok" ? { categories: categories.data, page: page.data } : undefined;
  } catch {
    return undefined;
  }
}

/** The data part of the home page. `params` is read inside a <Suspense> boundary (Next 16), while the hero, which needs no URL data, is in the static shell. */
async function HomeData({ params }: Pick<PageProps<"/[locale]">, "params">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const origin = siteOrigin();
  return (
    <>
      <JsonLd data={organizationJsonLd(origin)} />
      <JsonLd data={websiteJsonLd(locale, origin)} />
      <HomeCatalogSections initial={await homeInitial()} />
    </>
  );
}

export default function HomePage(props: PageProps<"/[locale]">) {
  return (
    <>
      <Hero />
      <Benefits />
      <Suspense fallback={<div className="container-page mt-14"><Skeleton className="h-8 w-56" /></div>}><HomeData params={props.params} /></Suspense>
    </>
  );
}
