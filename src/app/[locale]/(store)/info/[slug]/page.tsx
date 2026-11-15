import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { InfoBody } from "@/features/info/info-body";
import { type InfoPageSlug, infoPages } from "@/config/site";
import { isLocale, locales } from "@/i18n/config";
import { getT } from "@/i18n/server";

export function generateStaticParams() {
  return locales.flatMap((locale) => Object.keys(infoPages).map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/info/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = infoPages[slug as InfoPageSlug];
  return isLocale(locale) && page ? { title: getT(locale)(page.key) } : {};
}

export default async function InfoPage({ params }: PageProps<"/[locale]/info/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const page = infoPages[slug as InfoPageSlug];
  if (!page) notFound();
  const t = getT(locale);
  return (
    <div className="container-page max-w-3xl py-8 sm:py-12">
      <Breadcrumbs items={[{ label: t("catalog.home"), href: "/" }, { label: t(page.key) }]} />
      <h1 className="text-h1 mt-6">{t(page.key)}</h1>
      <InfoBody kind={page.kind} />
    </div>
  );
}
