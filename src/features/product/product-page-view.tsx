"use client";

import { Compass } from "lucide-react";
import { useMemo } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { ProductGrid } from "@/features/catalog/product-card";
import { useT } from "@/i18n/provider";
import { relatedProducts, useStorefront } from "@/lib/catalog/hooks";
import { ProductDetails } from "./product-details";
import { ProductExperience } from "./product-experience";

/** Product page body. Reads the demo catalog store so a product the seller just published is already here. */
export function ProductPageView({ slug }: { slug: string }) {
  const t = useT();
  const { ready, products, categories } = useStorefront();
  const product = products.find((p) => p.slug === slug);
  const related = useMemo(() => (product ? relatedProducts(product, products, 4) : []), [product, products]);
  const category = product ? categories.find((c) => c.slug === product.categorySlug) : undefined;

  if (!ready) return <div className="container-page py-8" role="status" aria-label={t("common.loading")}><Skeleton className="h-4 w-64" /><div className="mt-6 grid gap-8 lg:grid-cols-2"><Skeleton className="aspect-square" /><Skeleton className="h-96" /></div></div>;
  if (!product) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={<Compass aria-hidden />} title={t("errorPage.notFoundTitle")} description={t("errorPage.notFoundText")}>
          <ButtonLink href="/products">{t("errorPage.browse")}</ButtonLink>
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="container-page py-6 pb-24 sm:py-8 lg:pb-8">
      <Breadcrumbs items={[{ label: t("catalog.home"), href: "/" }, { label: t("catalog.shop"), href: "/products" }, ...(category ? [{ label: category.name, href: `/products?category=${category.slug}` }] : []), { label: product.name }]} />
      <div className="mt-5 sm:mt-7">
        <ProductExperience key={product.id} product={product}>
          <ProductDetails product={product} />
        </ProductExperience>
      </div>
      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-16 sm:mt-24">
          <h2 id="related-title" className="text-h2 mb-6">{t("product.youMayAlsoLike")}</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
