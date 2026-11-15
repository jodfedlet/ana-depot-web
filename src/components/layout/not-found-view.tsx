"use client";

import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { useT } from "@/i18n/provider";
import { Footer } from "./footer";
import { Header } from "./header";

/** 404 UI. Rendered with the storefront chrome so the language selector stays available. */
export function NotFoundView() {
  const t = useT();
  return (
    <>
      <Header />
      <main id="main" className="container-page flex-1 py-16">
        <EmptyState icon={<Compass aria-hidden />} title={t("errorPage.notFoundTitle")} description={t("errorPage.notFoundText")}>
          <ButtonLink href="/products">{t("errorPage.browse")}</ButtonLink>
          <ButtonLink href="/" variant="outline">{t("common.backToHome")}</ButtonLink>
        </EmptyState>
      </main>
      <Footer />
    </>
  );
}
