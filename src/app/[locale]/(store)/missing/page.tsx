import { notFound } from "next/navigation";
import { locales } from "@/i18n/config";

/**
 * Target of the proxy's rewrite for a product or category that does not exist (src/proxy.ts). It is prerendered, and `notFound()` during prerendering keeps the HTTP status:
 * the visitor sees the storefront's 404 page with a real 404 (not a streamed 200), and crawlers drop the URL.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function MissingPage() {
  notFound();
}
