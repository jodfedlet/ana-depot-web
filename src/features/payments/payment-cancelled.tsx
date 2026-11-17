"use client";

import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { useT } from "@/i18n/provider";
import { isReferenceShape } from "@/lib/payments/online";
import { normalizeReference } from "@/lib/reservations/access-store";

/** The customer closed Stripe Checkout. Nothing was charged by Ana Dépôt, the reservation is untouched, and pay-at-pickup is still possible. No claim of cancellation or refund. */
export function PaymentCancelledView() {
  const t = useT();
  const reference = normalizeReference(useSearchParams().get("reference") ?? "");
  const valid = isReferenceShape(reference);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-h1">{t("onlinePay.cancelled.title")}</h1>
        {valid && <p className="text-body mt-1 text-ink-soft" translate="no">{reference}</p>}
      </header>
      <Alert tone="info" title={t("onlinePay.cancelled.text")}>{t("onlinePay.cancelled.payAtStore")}</Alert>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={valid ? `/reservations/${encodeURIComponent(reference)}` : "/reservations"} size="lg">{t("onlinePay.cancelled.back")}</ButtonLink>
      </div>
    </div>
  );
}
