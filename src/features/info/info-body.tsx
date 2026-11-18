"use client";

import { Alert, DemoNotice } from "@/components/ui/alert";
import { ApiErrorState } from "@/components/ui/api-error";
import { Skeleton } from "@/components/ui/states";
import { PickupInfo } from "@/features/reservations/shared";
import { useLText, useT } from "@/i18n/provider";
import { usePickupView } from "@/lib/api/pickup-hooks";
import { useCardOffered } from "@/lib/api/payment-capabilities";

/** Info page content. "how" is real (it describes the implemented model); "pickup" shows live settings; others wait for business text. */
export function InfoBody({ kind }: { kind: "how" | "pickup" | "placeholder" }) {
  const t = useT();
  const cardOffered = useCardOffered();
  const lt = useLText();
  const { view, loading, error, reload } = usePickupView();

  if (kind === "how") {
    return (
      <div className="mt-6">
        <h2 className="text-h2">{t("info.howSteps.title")}</h2>
        <ol className="text-body mt-4 list-decimal space-y-3 pl-6 text-ink-soft">
          <li>{t("info.howSteps.s1")}</li><li>{t("info.howSteps.s2")}</li><li>{t("info.howSteps.s3")}</li><li>{t("info.howSteps.s4")}</li><li>{t(cardOffered ? "info.howSteps.s5Both" : "info.howSteps.s5")}</li>
        </ol>
        <Alert tone="info" className="mt-6">{t(cardOffered ? "info.howSteps.paymentsBoth" : "info.howSteps.payments")}</Alert>
      </div>
    );
  }
  if (kind === "pickup") {
    if (error != null) return <div className="mt-6"><ApiErrorState error={error} onRetry={reload} /></div>;
    if (loading || !view) return <div className="mt-6" role="status" aria-label={t("common.loading")}><Skeleton className="h-48 w-full" /></div>;
    return (
      <div className="mt-6">
        {view.status === "disabled" && <Alert tone="warning" className="mb-6">{lt(view.message) || t("pickup.unavailableDefault")}</Alert>}
        {view.status === "not_configured" && <Alert tone="info" title={t("pickup.notConfiguredTitle")}>{t("pickup.notConfiguredText")}</Alert>}
        {view.status === "available" && (
          <div className="rounded-card border border-line bg-surface p-5">
            <h2 className="text-h3 mb-3">{t("info.pickupLive")}</h2>
            <PickupInfo location={view.location} instructions={view.instructions} />
          </div>
        )}
      </div>
    );
  }
  return <DemoNotice className="mt-6" title={t("info.placeholderTitle")}>{t("info.placeholderText")}</DemoNotice>;
}
