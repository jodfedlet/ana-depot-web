"use client";

import { useT } from "@/i18n/provider";
import { apiErrorKey } from "@/lib/api/errors";
import { ErrorState } from "./states";

/** A failed server call, shown with a translated, customer-safe message (never the backend's raw text) and a retry. */
export function ApiErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const t = useT();
  return <ErrorState className={className} title={t("dataState.errorTitle")} message={t(apiErrorKey(error))} onRetry={onRetry} />;
}
