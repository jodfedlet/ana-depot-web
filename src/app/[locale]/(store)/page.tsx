import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Benefits, HomeCatalogSections, Hero } from "@/features/home/sections";
import { isLocale, locales } from "@/i18n/config";
import { getT } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { description: getT(locale)("site.description"), alternates: { languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])) } };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <>
      <Hero />
      <Benefits />
      <HomeCatalogSections />
    </>
  );
}
