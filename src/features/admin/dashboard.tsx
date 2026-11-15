"use client";

import { AlertTriangle, MapPin } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { MoneyTotals } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/states";
import { ReservationStatusBadge, reservationStatusTone } from "@/features/reservations/shared";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLText, useT } from "@/i18n/provider";
import { pickupAvailability } from "@/lib/pickup/types";
import { countByStatus } from "@/lib/reservations/query";
import { customerFullName, reservationStatuses } from "@/lib/reservations/types";
import { isOverdue } from "@/lib/reservations/workflow";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { usePickup } from "@/lib/stores/pickup-store";
import { useReservations } from "@/lib/stores/reservation-store";
import { useCatalogState } from "@/lib/stores/catalog-store";
import { stockOf, stockState } from "@/lib/catalog/stock";
import { recentActivity } from "@/lib/activity";
import { pick } from "@/lib/localized";
import { useLocale } from "@/i18n/provider";
import { cn } from "@/lib/cn";
import { type DialogKind, ReservationActionDialog } from "./reservation-actions";

const toneBar: Record<string, string> = { warning: "bg-warning-fg", info: "bg-info-fg", success: "bg-success-fg", brand: "bg-brand-700", danger: "bg-danger-fg", neutral: "bg-line-strong" };

export function Dashboard() {
  const t = useT();
  const lt = useLText();
  const fmt = useFormat();
  const ready = useIsClient();
  const all = useReservations();
  const { settings } = usePickup();
  const { products, movements } = useCatalogState();
  const locale = useLocale();
  const [target, setTarget] = useState<{ id: string; kind: DialogKind } | null>(null);

  if (!ready) return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-24 w-full" /><Skeleton className="mt-4 h-64 w-full" /></div>;

  const counts = countByStatus(all);
  const pending = all.filter((r) => r.status === "pending_review").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const recent = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const overdue = all.filter((r) => isOverdue(r, new Date().toISOString())).length;
  const availability = pickupAvailability(settings);
  const flagged = products.filter((p) => p.status === "active" && p.inventory.tracked).map((p) => ({ p, state: stockState(p, stockOf(p, all)), info: stockOf(p, all) })).filter((x) => x.state === "low" || x.state === "out");
  const out = flagged.filter((x) => x.state === "out");
  const low = flagged.filter((x) => x.state === "low");
  const activity = recentActivity(all, movements, 8);
  const productName = (id: string) => { const p = products.find((x) => x.id === id); return p ? pick(p.name, locale) : id; };
  const targetReservation = target ? all.find((r) => r.id === target.id) : undefined;

  return (
    <div className="space-y-6">
      <section aria-labelledby="stat-title">
        <h2 id="stat-title" className="sr-only">{t("admin.dashboard.byStatus")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {reservationStatuses.map((s) => (
            <li key={s}>
              <Link href={`/admin/reservations?status=${s}`} className="group relative block h-full overflow-hidden rounded-card border border-line bg-surface p-4 hover:border-line-strong">
                <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", toneBar[reservationStatusTone[s]])} />
                <p className="text-caption text-ink-soft group-hover:text-ink">{t(`status.${s}`)}</p>
                <p className="mt-1 font-display text-3xl tabular-nums">{counts[s]}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {overdue > 0 && <Alert tone="warning" live="polite"><span className="inline-flex items-center gap-2"><AlertTriangle aria-hidden className="size-4" />{t("admin.dashboard.overdue", { count: overdue })}</span></Alert>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="attn-title" className="rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id="attn-title" className="text-h3">{t("admin.dashboard.needsAttention")} <Badge tone="warning" className="ml-1">{pending.length}</Badge></h2>
            <Link href="/admin/reservations?status=pending_review" className="text-label font-semibold text-brand-700 hover:underline">{t("admin.dashboard.viewAll")}</Link>
          </div>
          {pending.length === 0 ? <p className="text-label px-5 py-8 text-center font-normal text-ink-soft">{t("admin.dashboard.needsAttentionEmpty")}</p> : (
            <ul className="divide-y divide-line">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-label font-semibold" translate="no">{r.reference}</p>
                    <p className="text-caption text-ink-soft">{customerFullName(r.customer)} · {fmt.dateTime(r.createdAt)} · <MoneyTotals totals={r.totals} inline /></p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ButtonLink href={`/admin/reservations/${r.reference}`} variant="ghost" size="sm">{t("admin.dashboard.review")}</ButtonLink>
                    <Button size="sm" variant="danger" onClick={() => setTarget({ id: r.id, kind: "reject" })}>{t("admin.dashboard.quickReject")}</Button>
                    <Button size="sm" onClick={() => setTarget({ id: r.id, kind: "accept" })}>{t("admin.dashboard.quickAccept")}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section aria-labelledby="pk-title" className="rounded-card border border-line bg-surface p-5">
            <h2 id="pk-title" className="text-h3 flex items-center gap-2"><MapPin aria-hidden className="size-4" />{t("admin.dashboard.pickup")}</h2>
            <div className="mt-3"><Alert tone={availability === "available" ? "success" : "warning"} live="polite">{availability === "available" ? t("admin.dashboard.pickupOn") : availability === "disabled" ? t("admin.dashboard.pickupOff") : t("admin.dashboard.pickupIncomplete")}</Alert></div>
            <p className="text-label mt-3 font-normal text-ink-soft">{settings.location.storeName} — {settings.location.addressLine}, {settings.location.city}</p>
            <p className="text-caption mt-2 text-ink-muted">{settings.holdPeriodDays ? t("admin.dashboard.holdDays", { count: settings.holdPeriodDays }) : t("admin.dashboard.holdNone")}</p>
            {availability === "disabled" && <p className="text-caption mt-1 text-ink-muted">{lt(settings.unavailableMessage)}</p>}
            <ButtonLink href="/admin/pickup-settings" variant="outline" size="sm" className="mt-4">{t("admin.dashboard.managePickup")}</ButtonLink>
          </section>

          <section aria-labelledby="rc-title" className="rounded-card border border-line bg-surface">
            <h2 id="rc-title" className="text-h3 border-b border-line px-5 py-4">{t("admin.dashboard.recent")}</h2>
            <ul className="divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/reservations/${r.reference}`} className="flex min-h-14 items-center gap-3 px-5 py-2.5 hover:bg-sand-50">
                    <div className="min-w-0 flex-1"><p className="text-label whitespace-nowrap font-semibold" translate="no">{r.reference}</p><p className="text-caption truncate text-ink-soft">{customerFullName(r.customer)}</p></div>
                    <ReservationStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="stk-t" className="rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 id="stk-t" className="text-h3">{t("admin.dashboard.stock")}</h2><Link href="/admin/inventory" className="text-label font-semibold text-brand-700 hover:underline">{t("admin.dashboard.viewInventory")}</Link></div>
          <div className="grid gap-px bg-line sm:grid-cols-2">
            {([["out", out, "danger", t("admin.dashboard.outOfStock"), t("admin.dashboard.outEmpty")], ["low", low, "warning", t("admin.dashboard.lowStock"), t("admin.dashboard.lowEmpty")]] as const).map(([k, list, tone, title, empty]) => (
              <div key={k} className="bg-surface p-5">
                <p className="text-label flex items-center gap-2 font-semibold">{title} <Badge tone={tone}>{list.length}</Badge></p>
                {list.length === 0 ? <p className="text-caption mt-2 text-ink-soft">{empty}</p> : (
                  <ul className="mt-2 space-y-1.5">{list.slice(0, 5).map(({ p, info }) => <li key={p.id}><Link href={`/admin/products/${p.id}`} className="text-label flex items-baseline justify-between gap-3 font-normal hover:underline"><span className="truncate">{pick(p.name, locale)}</span><span className="text-caption shrink-0 text-ink-soft">{t("admin.dashboard.availableCount", { count: info.available })}</span></Link></li>)}</ul>
                )}
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="act-t" className="rounded-card border border-line bg-surface">
          <h2 id="act-t" className="text-h3 border-b border-line px-5 py-4">{t("admin.dashboard.activity")}</h2>
          <ul className="divide-y divide-line">
            {activity.map((a, i) => (
              <li key={`${a.at}-${i}`} className="px-5 py-2.5">
                {a.kind === "reservation" ? (
                  <Link href={`/admin/reservations/${a.reference}`} className="text-label font-normal hover:underline"><span className="font-semibold" translate="no">{a.reference}</span> — {t(a.event === "cancelled" ? "events.cancelledByStore" : (`events.${a.event}` as "events.submitted"), { amount: "", name: a.actor })}</Link>
                ) : (
                  <Link href="/admin/inventory" className="text-label font-normal hover:underline"><span className={a.movement.delta >= 0 ? "font-semibold text-success-fg" : "font-semibold text-danger-fg"}>{a.movement.delta > 0 ? `+${a.movement.delta}` : a.movement.delta}</span> {productName(a.productId)} — {t(`admin.inventory.movementTypes.${a.movement.type}`)}</Link>
                )}
                <p className="text-caption text-ink-muted">{fmt.dateTime(a.at)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {targetReservation && target && <ReservationActionDialog reservation={targetReservation} kind={target.kind} onClose={() => setTarget(null)} />}
    </div>
  );
}
