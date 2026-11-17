import { ProductList } from "@/features/admin/products/product-list";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminProductsPage({ params }: PageProps<"/[locale]/admin/products">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("admin.products.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("admin.products.subtitle")}</p></header>
      <Suspense><ProductList /></Suspense>
    </>
  );
}
