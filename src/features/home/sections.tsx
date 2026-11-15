"use client";

import { ArrowRight, PackageSearch, Percent, ShoppingBag, Store, Wallet } from "lucide-react";
import Image from "@/components/ui/smart-image";
import { ButtonLink } from "@/components/ui/button";
import { ProductCard, ProductGrid } from "@/features/catalog/product-card";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { useStorefront } from "@/lib/catalog/hooks";
import type { Category } from "@/lib/catalog-types";
import { Skeleton } from "@/components/ui/states";

export function Hero() {
  const t = useT();
  return (
    <section aria-labelledby="hero-title" className="border-b border-line bg-sand-100">
      <div className="container-page grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-0">
        <div className="max-w-xl lg:py-20">
          <p className="text-eyebrow text-brand-700">{t("home.hero.eyebrow")}</p>
          <h1 id="hero-title" className="text-display mt-4 text-balance">{t("home.hero.title")}</h1>
          <p className="text-body mt-5 max-w-md text-pretty text-ink-soft sm:text-lg">{t("home.hero.description")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/products" size="lg">{t("home.hero.primary")}</ButtonLink>
            <ButtonLink href="/#categories" size="lg" variant="outline">{t("home.hero.secondary")}</ButtonLink>
          </div>
        </div>
        <div className="relative -mx-4 aspect-[6/5] sm:mx-0 lg:aspect-auto lg:h-full lg:min-h-[34rem] lg:self-stretch">
          <Image src="/sample/hero.svg" alt={t("home.hero.imageAlt")} fill sizes="(min-width:1024px) 50vw, 100vw" loading="eager" fetchPriority="high" className="object-cover object-bottom lg:object-contain lg:[mask-image:linear-gradient(to_right,transparent,black_9%,black_91%,transparent)]" />
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

/** Home merchandising, read from the demo catalog store (so the seller's categories and products appear at once). */
export function HomeCatalogSections() {
  const t = useT();
  const { ready, categories, products } = useStorefront();
  if (!ready) return <div className="container-page mt-14"><Skeleton className="h-8 w-56" /><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}</div></div>;
  const featured = products.slice(0, 8);
  const arrivals = products.filter((p) => p.isNew).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  return (
    <>
      <section id="categories" aria-labelledby="categories-title" className="container-page mt-14 sm:mt-20 scroll-mt-28">
        <SectionHeading id="categories-title" title={t("home.categories")} link={{ label: t("home.allProducts"), href: "/products" }} />
        <CategoryGrid categories={categories} />
      </section>
      <section aria-labelledby="featured-title" className="container-page mt-14 sm:mt-20">
        <SectionHeading id="featured-title" title={t("home.featured")} link={{ label: t("home.viewAll"), href: "/products" }} />
        <ProductGrid products={featured} />
      </section>
      <div className="mt-14 sm:mt-20"><PromoBand /></div>
      {arrivals.length > 0 && (
        <section aria-labelledby="arrivals-title" className="container-page mt-14 sm:mt-20">
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col justify-center sm:col-span-2 lg:col-span-1 lg:pr-6">
              <h2 id="arrivals-title" className="text-h2">{t("home.arrivals.title")}</h2>
              <p className="text-body mt-2 text-ink-soft">{t("home.arrivals.text")}</p>
              <Link href="/products?sort=newest" className="text-label mt-4 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-700 hover:underline underline-offset-2">{t("home.arrivals.cta")} <ArrowRight aria-hidden className="size-4" /></Link>
            </div>
            {arrivals.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </>
  );
}

export { Store };
