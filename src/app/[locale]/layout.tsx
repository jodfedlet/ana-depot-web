import type { Metadata, Viewport } from "next";
import { Fraunces, Geist } from "next/font/google";
import { notFound } from "next/navigation";
import { ToastProvider } from "@/components/ui/toast";
import { type Locale, isLocale, locales } from "@/i18n/config";
import { I18nProvider } from "@/i18n/provider";
import { getStorefrontMessages, getT } from "@/i18n/server";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// Static on purpose: awaiting `params` here blocks prerendering of routes with on-demand segments.
// Localized descriptions and hreflang alternates are declared by the pages that need them.
export const metadata: Metadata = { title: { default: "Ana Dépôt", template: "%s · Ana Dépôt" } };

export const viewport: Viewport = { themeColor: "#0f4640" };

/** Root layout. `lang` follows the URL; the storefront dictionary of that language is sent to the browser. */
export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l: Locale = locale;
  const t = getT(l);
  return (
    <html lang={l} className={`${geistSans.variable} ${fraunces.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={l} messages={getStorefrontMessages(l)}>
          <a
            href="#main"
            className="text-label fixed left-3 top-3 z-[80] -translate-y-24 rounded-control bg-brand-700 px-4 py-2.5 font-semibold text-white focus:translate-y-0"
          >
            {t("common.skipToContent")}
          </a>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
