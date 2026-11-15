import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { I18nProvider } from "@/i18n/provider";
import { getMessages } from "@/i18n/server";

// Static on purpose: metadata that awaits params would block prerendering of dynamic admin routes.
export const metadata: Metadata = {
  title: { default: "Ana Dépôt · Admin", template: "%s · Ana Dépôt Admin" },
  robots: { index: false, follow: false },
};

/** Administration area: not indexed, and the (larger) admin dictionary is only sent to the browser here. */
export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <I18nProvider locale={locale} messages={getMessages(locale)}>{children}</I18nProvider>;
}
