"use client";

import { Compass } from "lucide-react";
import { ApiErrorState } from "@/components/ui/api-error";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { ProductGrid } from "@/features/catalog/product-card";
import { useT } from "@/i18n/provider";
import { type ProductInitial, useProductPage } from "@/lib/api/catalog-hooks";
import { ProductDetails } from "./product-details";
import { ProductExperience } from "./product-experience";

/** Product page body. The product, its prices, its variants and its availability are what the API returns for this slug right now. */
export function ProductPageView({ slug, initial }: { slug: string; initial?: ProductInitial }) {
  const t = useT();
  const { product, related, notFound, loading, error, reload } = useProductPage(slug, initial);

  if (notFound || product === null) {
    return (
      <div className="container-page py-16">
        <EmptyState icon={<Compass aria-hidden />} title={t("errorPage.notFoundTitle")} description={t("errorPage.notFoundText")}>
          <ButtonLink href="/products">{t("errorPage.browse")}</ButtonLink>
        </EmptyState>
      </div>
    );
  }
  if (error != null) return <div className="container-page py-16"><ApiErrorState error={error} onRetry={reload} /></div>;
  if (loading || !product) {
    return <div className="container-page py-8" role="status" aria-label={t("common.loading")}><Skeleton className="h-4 w-64" /><div className="mt-6 grid gap-8 lg:grid-cols-2"><Skeleton className="aspect-square" /><Skeleton className="h-96" /></div></div>;
  }
  return (
    <div className="container-page py-6 pb-24 sm:py-8 lg:pb-8">
      <Breadcrumbs items={[{ label: t("catalog.home"), href: "/" }, { label: t("catalog.shop"), href: "/products" }, ...(product.categoryName ? [{ label: product.categoryName, href: `/categories/${product.categorySlug}` }] : []), { label: product.name }]} />
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
