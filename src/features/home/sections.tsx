"use client";

import { ArrowRight, PackageSearch, Percent, ShoppingBag, Store, Wallet } from "lucide-react";
import Image from "@/components/ui/smart-image";
import { ButtonLink } from "@/components/ui/button";
import { ApiErrorState } from "@/components/ui/api-error";
import { ProductGrid } from "@/features/catalog/product-card";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { type CatalogInitial, useCatalogPage, useCategories } from "@/lib/api/catalog-hooks";
import { HOME_QUERY } from "@/lib/catalog-query";
import type { Category } from "@/lib/catalog-types";
import { EmptyState, Skeleton } from "@/components/ui/states";

/** The headline is one translated string; its sentences are stacked on their own lines (the last one in the brand colour) without splitting the text for screen readers or crawlers. */
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean);

export function Hero() {
  const t = useT();
  const lines = sentences(t("home.hero.title"));
  return (
    <section aria-labelledby="hero-title" className="border-b border-line bg-sand-100">
      <div className="container-page grid items-center gap-6 py-9 sm:gap-8 sm:py-12 md:grid-cols-[1.2fr_1fr] md:gap-6 md:py-0 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
        <div className="md:py-16 lg:py-20">
          <p className="text-eyebrow text-brand-700">{t("home.hero.eyebrow")}</p>
          <h1 id="hero-title" className="text-display mt-4 md:max-lg:text-[2.5rem]">
            {lines.map((line, i) => <span key={i} className={i === lines.length - 1 && lines.length > 1 ? "block text-brand-700" : "block"}>{line}{i < lines.length - 1 ? " " : ""}</span>)}
          </h1>
          <p className="text-body mt-5 max-w-[30rem] text-pretty text-ink-soft sm:text-lg sm:leading-8">{t("home.hero.description")}</p>
          <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row md:flex-col lg:flex-row">
            <ButtonLink href="/products" size="lg" className="w-full shadow-sm active:translate-y-px sm:w-auto sm:px-7 md:w-full lg:w-auto">{t("home.hero.primary")}<ArrowRight aria-hidden className="size-4" /></ButtonLink>
            <ButtonLink href="/#categories" size="lg" variant="outline" className="w-full active:translate-y-px sm:w-auto md:w-full lg:w-auto">{t("home.hero.secondary")}</ButtonLink>
          </div>
        </div>
        <div className="relative -mx-4 aspect-[6/5] sm:mx-0 md:aspect-auto md:h-full md:min-h-[26rem] md:self-stretch lg:min-h-[34rem]">
          <Image src="/sample/hero.svg" alt={t("home.hero.imageAlt")} fill sizes="(min-width:1024px) 50vw, (min-width:768px) 48vw, 100vw" loading="eager" fetchPriority="high" className="object-cover object-bottom md:object-contain md:[mask-image:linear-gradient(to_right,transparent,black_9%,black_91%,transparent)]" />
        </div>
      </div>
    </section>
  );
}

export function Benefits() {
  const t = useT();
  const items = [
    { icon: ShoppingBag, title: t("home.benefits.reserveTitle"), text: t("home.benefits.reserveText") },
    { icon: Percent, title: t("home.benefits.wholesaleTitle"), text: t("home.benefits.wholesaleText") },
    { icon: Wallet, title: t("home.benefits.payTitle"), text: t("home.benefits.payText") },
    { icon: PackageSearch, title: t("home.benefits.trackTitle"), text: t("home.benefits.trackText") },
  ];
  return (
    <section aria-label={t("home.benefits.label")} className="border-b border-line bg-surface">
      <ul className="container-page grid grid-cols-2 gap-x-4 gap-y-6 py-7 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <Icon aria-hidden className="mt-0.5 size-6 shrink-0 text-brand-700" strokeWidth={1.6} />
            <div><p className="text-label font-semibold">{title}</p><p className="text-caption mt-0.5 text-ink-soft">{text}</p></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SectionHeading({ id, title, description, link }: { id?: string; title: string; description?: string; link?: { label: string; href: string } }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
      <div>
        <h2 id={id} className="text-h2">{title}</h2>
        {description && <p className="text-body mt-1.5 text-ink-soft">{description}</p>}
      </div>
      {link && (
        <Link href={link.href} className="text-label inline-flex min-h-11 shrink-0 items-center gap-1.5 font-semibold text-brand-700 hover:underline underline-offset-2">
          {link.label}<ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  );
}

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
      {categories.map((c) => (
        <li key={c.slug}>
          <Link href={`/products?category=${c.slug}`} className="group block h-full overflow-hidden rounded-card border border-line bg-surface">
            <div className="relative aspect-[4/3] overflow-hidden bg-sand-100">
              <Image src={c.image.src} alt={c.image.alt} fill sizes="(min-width:1024px) 16vw, (min-width:640px) 33vw, 50vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
            </div>
            <div className="p-3">
              <h3 className="text-h3 group-hover:underline underline-offset-2">{c.name}</h3>
              <p className="text-caption mt-0.5 line-clamp-2 text-ink-soft">{c.description}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PromoBand() {
  const t = useT();
  return (
    <section aria-labelledby="promo-title" className="container-page">
      <div className="grid overflow-hidden rounded-card bg-accent-100 md:grid-cols-2">
        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
          <p className="text-eyebrow text-accent-700">{t("home.promo.eyebrow")}</p>
          <h2 id="promo-title" className="text-h1 mt-3">{t("home.promo.title")}</h2>
          <p className="text-body mt-3 max-w-sm text-ink-soft">{t("home.promo.description")}</p>
          <ButtonLink href="/products?wholesale=1" variant="accent" size="lg" className="mt-7 self-start">{t("home.promo.cta")}</ButtonLink>
        </div>
        <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[22rem]">
          <Image src="/sample/promo.svg" alt={t("home.promo.imageAlt")} fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
        </div>
      </div>
    </section>
  );
}

/** Home merchandising from the API: the active categories and the latest published products (the API's `newest` order; no "featured" flag exists). */
export function HomeCatalogSections({ initial }: { initial?: CatalogInitial }) {
  const t = useT();
  const cats = useCategories(initial?.categories);
  const latest = useCatalogPage(HOME_QUERY, initial);
  const loading = (cats.loading && !cats.categories.length) || (latest.loading && !latest.result);
  if (loading) return <div className="container-page mt-14" role="status" aria-label={t("common.loading")}><Skeleton className="h-8 w-56" /><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[4/3]" />)}</div></div>;
  if (cats.error != null && !cats.categories.length) return <div className="container-page mt-14"><ApiErrorState error={cats.error} onRetry={cats.reload} /></div>;
  const products = latest.result?.products ?? [];
  if (!cats.categories.length && !products.length) {
    return <div className="container-page mt-14"><EmptyState icon={<PackageSearch aria-hidden />} title={t("home.emptyTitle")} description={t("home.emptyText")} /></div>;
  }
  return (
    <>
      {cats.categories.length > 0 && (
        <section id="categories" aria-labelledby="categories-title" className="container-page mt-14 sm:mt-20 scroll-mt-28">
          <SectionHeading id="categories-title" title={t("home.categories")} link={{ label: t("home.allProducts"), href: "/products" }} />
          <CategoryGrid categories={cats.categories} />
        </section>
      )}
      {products.length > 0 && (
        <section aria-labelledby="featured-title" className="container-page mt-14 sm:mt-20">
          <SectionHeading id="featured-title" title={t("home.featured")} link={{ label: t("home.viewAll"), href: "/products?sort=newest" }} />
          <ProductGrid products={products} />
        </section>
      )}
      <div className="mt-14 sm:mt-20"><PromoBand /></div>
    </>
  );
}

export { Store };
