import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductPageView } from "@/features/product/product-page-view";
import { isLocale, locales } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { loadCategory, loadProductBySlug, loadProductPage } from "@/lib/api/server-catalog";
import { PLACEHOLDER_IMAGE, toProduct } from "@/lib/api/map-catalog";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteOrigin } from "@/lib/seo/site";
import { plainSnippet } from "@/lib/seo/text";

/**
 * Product pages are rendered ON THE SERVER from the public API (name, price per currency, availability, images, JSON-LD and meta all present in the HTML), cached for a
 * minute and dropped on demand when staff change the catalog (`POST /api/revalidate-catalog`). An unknown, draft or inactive product is a real HTTP 404.
 * One placeholder slug per language gives the route a prerendered shell.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale, slug: "produit" }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/products/[slug]">): Promise<Metadata> {
  const { locale, slug: raw } = await params;
  if (!isLocale(locale)) return {};
  const slug = decodeURIComponent(raw);
  const loaded = await loadProductBySlug(slug);
  if (loaded.status !== "ok") return { robots: { index: false, follow: false } };
  const category = await loadCategory(loaded.data.categorySlug);
  const product = toProduct(loaded.data, locale, category.status === "ok" ? category.data : undefined);
  if (!product) return { robots: { index: false, follow: false } };
  const t = getT(locale);
  const description = plainSnippet(product.description.join(" "), 160)
    || (product.categoryName ? t("seo.productInCategoryDescription", { name: product.name, category: product.categoryName }) : t("seo.productDescription", { name: product.name }));
  const image = product.images.find((i) => i.src !== PLACEHOLDER_IMAGE)?.src;
  // The canonical path is the product's own slug, whichever form (slug or id) was requested.
  return pageMetadata({ locale, path: `/products/${product.slug}`, title: product.name, description, image });
}

export default async function ProductPage({ params }: PageProps<"/[locale]/products/[slug]">) {
  const { locale, slug: raw } = await params;
  if (!isLocale(locale)) notFound();
  const slug = decodeURIComponent(raw);
  const loaded = await loadProductBySlug(slug);
  if (loaded.status === "missing") notFound();
  if (loaded.status === "unconfigured") return <ProductPageView slug={slug} />;

  const dto = loaded.data;
  const [category, related] = await Promise.all([loadCategory(dto.categorySlug), loadProductPage({ category: dto.categorySlug }, 5)]);
  const initial = { product: dto, category: category.status === "ok" ? category.data : undefined, related: related.status === "ok" ? related.data : undefined };
  const product = toProduct(dto, locale, initial.category);
  const t = getT(locale);
  const origin = siteOrigin();
  return (
    <>
      {product && (
        <>
          <JsonLd data={productJsonLd(product, locale, origin)} />
          <JsonLd
            data={breadcrumbJsonLd(
              locale,
              [
                { name: t("catalog.home"), path: "/" },
                { name: t("catalog.shop"), path: "/products" },
                ...(product.categoryName ? [{ name: product.categoryName, path: `/categories/${product.categorySlug}` }] : []),
                { name: product.name },
              ],
              origin,
            )}
          />
        </>
      )}
      <ProductPageView key={slug} slug={slug} initial={initial} />
    </>
  );
}
