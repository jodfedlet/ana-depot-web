"use client";

import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { useT } from "@/i18n/provider";
import { reportClientError } from "@/lib/observability/report";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  useEffect(() => {
    reportClientError(error); // privacy-safe; goes to a monitoring sink only once one is registered (docs/operations.md)
  }, [error]);
  return (
    <div className="container-page py-16">
      <ErrorState title={t("errorPage.title")} message={t("errorPage.text")} onRetry={retry} />
      <p className="text-center"><ButtonLink href="/" variant="ghost">{t("common.backToHome")}</ButtonLink></p>
    </div>
  );
}
