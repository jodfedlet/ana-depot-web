"use client";

import { CheckCircle2, CircleDashed, Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/states";
import { useT } from "@/i18n/provider";
import { siteConfig } from "@/config/site";
import { pickupAvailability } from "@/lib/pickup/types";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { usePickup } from "@/lib/stores/pickup-store";

type State = "configured" | "notConfigured" | "decisionPending" | "fixed";

function Card({ title, state, children, action }: { title: string; state: State; children: ReactNode; action?: ReactNode }) {
  const t = useT();
  const tone = state === "configured" || state === "fixed" ? "success" : state === "decisionPending" ? "warning" : "neutral";
  const Icon = state === "configured" || state === "fixed" ? CheckCircle2 : state === "decisionPending" ? Clock3 : CircleDashed;
  return (
    <li className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-h3">{title}</h2>
        <Badge tone={tone}><Icon aria-hidden className="mr-1 size-3.5" />{t(`admin.settings.${state}`)}</Badge>
      </div>
      <p className="text-label mt-2 font-normal text-ink-soft">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </li>
  );
}

/**
 * Store settings overview. Only settings whose business decisions exist are editable (pickup, which has its own screen).
 * Everything else is shown as "not configured" / "decision pending": no address, hours, contact or policy is invented.
 */
export function StoreSettings() {
  const t = useT();
  const ready = useIsClient();
  const { settings } = usePickup();
  if (!ready) return <Skeleton className="h-72 w-full" />;
  const pickupOk = pickupAvailability(settings) !== "not_configured";
  const hold = settings.holdPeriodDays;
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      <Card title={t("admin.settings.identityTitle")} state="fixed">{t("admin.settings.identityText", { name: siteConfig.name })}</Card>
      <Card title={t("admin.settings.pickupTitle")} state={pickupOk ? "configured" : "notConfigured"} action={<ButtonLink href="/admin/pickup-settings" variant="outline">{t("admin.settings.manage")}</ButtonLink>}>
        {pickupOk ? t("admin.settings.pickupTextOk") : t("admin.settings.pickupTextMissing")}
      </Card>
      <Card title={t("admin.settings.holdTitle")} state={hold ? "configured" : "decisionPending"} action={<ButtonLink href="/admin/pickup-settings" variant="outline">{t("admin.settings.manage")}</ButtonLink>}>
        {hold ? t("admin.settings.holdValue", { days: hold }) : t("admin.settings.holdNone")}
      </Card>
      <Card title={t("admin.settings.currenciesTitle")} state="fixed">{t("admin.settings.currenciesText")}</Card>
      <Card title={t("admin.settings.paymentsTitle")} state="fixed">{t("admin.settings.paymentsText")}</Card>
      <Card title={t("admin.settings.notificationsTitle")} state="decisionPending">{t("admin.settings.notificationsText")}</Card>
      <Card title={t("admin.settings.staffTitle")} state="decisionPending">{t("admin.settings.staffText")}</Card>
      <Card title={t("admin.settings.legalTitle")} state="decisionPending">{t("admin.settings.legalText")}</Card>
    </ul>
  );
}
