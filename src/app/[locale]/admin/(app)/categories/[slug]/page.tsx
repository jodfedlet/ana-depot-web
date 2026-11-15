import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/states";
import { CategoryEditor } from "@/features/admin/categories/category-views";
import { locales } from "@/i18n/config";

/** One placeholder slug per language so the route has a prerendered shell; real slugs render on demand. */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale, slug: "metal" }));
}

export const metadata: Metadata = { title: "Catégorie / Kategori" };

async function Content({ params }: Pick<PageProps<"/[locale]/admin/categories/[slug]">, "params">) {
  return <CategoryEditor slug={decodeURIComponent((await params).slug)} />;
}

export default function EditCategoryPage(props: PageProps<"/[locale]/admin/categories/[slug]">) {
  return <Suspense fallback={<Skeleton className="h-96 w-full" />}><Content params={props.params} /></Suspense>;
}
