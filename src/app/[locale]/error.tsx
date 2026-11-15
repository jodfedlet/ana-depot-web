"use client";

import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { useT } from "@/i18n/provider";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error); // replace with error reporting once an observability tool is chosen
  }, [error]);
  return (
    <div className="container-page py-16">
      <ErrorState title={t("errorPage.title")} message={t("errorPage.text")} onRetry={retry} />
      <p className="text-center"><ButtonLink href="/" variant="ghost">{t("common.backToHome")}</ButtonLink></p>
    </div>
  );
}
