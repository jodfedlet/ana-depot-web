import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/states";
import { ProductEditor } from "@/features/admin/products/product-form";
import { locales } from "@/i18n/config";

/** One placeholder id per language so the route has a prerendered shell; real ids render on demand. */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale, id: "p-001" }));
}

export const metadata: Metadata = { title: "Produit / Pwodwi" };

async function Content({ params }: Pick<PageProps<"/[locale]/admin/products/[id]">, "params">) {
  return <ProductEditor id={decodeURIComponent((await params).id)} />;
}

export default function EditProductPage(props: PageProps<"/[locale]/admin/products/[id]">) {
  return <Suspense fallback={<Skeleton className="h-96 w-full" />}><Content params={props.params} /></Suspense>;
}
