"use client";

import { Alert, DemoNotice } from "@/components/ui/alert";
import { PickupInfo } from "@/features/reservations/shared";
import { useLText, useT } from "@/i18n/provider";
import { pickupAvailability } from "@/lib/pickup/types";
import { usePickup } from "@/lib/stores/pickup-store";

/** Info page content. "how" is real (it describes the implemented model); "pickup" shows live settings; others wait for business text. */
export function InfoBody({ kind }: { kind: "how" | "pickup" | "placeholder" }) {
  const t = useT();
  const lt = useLText();
  const { settings } = usePickup();
  const availability = pickupAvailability(settings);

  if (kind === "how") {
    return (
      <div className="mt-6">
        <h2 className="text-h2">{t("info.howSteps.title")}</h2>
        <ol className="text-body mt-4 list-decimal space-y-3 pl-6 text-ink-soft">
          <li>{t("info.howSteps.s1")}</li><li>{t("info.howSteps.s2")}</li><li>{t("info.howSteps.s3")}</li><li>{t("info.howSteps.s4")}</li><li>{t("info.howSteps.s5")}</li>
        </ol>
        <Alert tone="info" className="mt-6">{t("info.howSteps.payments")}</Alert>
      </div>
    );
  }
  if (kind === "pickup") {
    return (
      <div className="mt-6">
        {availability === "disabled" && <Alert tone="warning" className="mb-6">{lt(settings.unavailableMessage) || t("pickup.unavailableDefault")}</Alert>}
        {availability === "not_configured" ? (
          <DemoNotice title={t("pickup.notConfiguredTitle")}>{t("pickup.notConfiguredText")}</DemoNotice>
        ) : (
          <div className="rounded-card border border-line bg-surface p-5">
            <h2 className="text-h3 mb-3">{t("info.pickupLive")}</h2>
            <PickupInfo location={settings.location} instructions={settings.instructions} />
          </div>
        )}
      </div>
    );
  }
  return <DemoNotice className="mt-6" title={t("info.placeholderTitle")}>{t("info.placeholderText")}</DemoNotice>;
}
