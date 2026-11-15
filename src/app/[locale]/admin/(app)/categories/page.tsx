import { notFound } from "next/navigation";
import { CategoryList } from "@/features/admin/categories/category-views";
import { isLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";

export default async function AdminCategoriesPage({ params }: PageProps<"/[locale]/admin/categories">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getT(locale);
  return (
    <>
      <header className="mb-6"><h1 className="text-h1">{t("admin.categories.title")}</h1><p className="text-body mt-1 text-ink-soft">{t("admin.categories.subtitle")}</p></header>
      <CategoryList />
    </>
  );
}
