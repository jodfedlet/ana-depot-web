"use client";

import { useState } from "react";
import { TextField } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/states";
import { useFormat } from "@/i18n/format";
import { useLocale, useT } from "@/i18n/provider";
import { SUPPORTED_CURRENCIES, type Money, amountIn, formatMoney } from "@/lib/money";
import { type Period, countIn, outstandingAtPickup, outstandingRows, paymentsIn, paymentsReceived, reservationValue } from "@/lib/reports/finance";
import { reservationStatuses } from "@/lib/reservations/types";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { useReservations } from "@/lib/stores/reservation-store";

/**
 * Reports skeleton. Every row names its measure; HTG and USD are separate COLUMNS (never summed); reservation value is
 * kept apart from payments received, and an uncollected reservation is never presented as revenue. No tax or
 * accounting rule is applied. Browser-only demo data until the reporting endpoints exist.
 */
export function ReportsView() {
  const t = useT();
  const fmt = useFormat();
  const locale = useLocale();
  const ready = useIsClient();
  const reservations = useReservations();
  const [period, setPeriod] = useState<Required<Period>>({ from: "", to: "" });
  if (!ready) return <Skeleton className="h-72 w-full" />;

  const closed = ["rejected", "cancelled", "expired"] as const;
  const open = ["pending_review", "confirmed", "ready_for_pickup"] as const;
  const rows: { key: string; label: string; count: number; figure: Money[]; sub?: boolean }[] = [
    { key: "submitted", label: t("admin.reports.submitted"), count: countIn(reservations, reservationStatuses, period), figure: reservationValue(reservations, reservationStatuses, period) },
    { key: "open", label: t("admin.reports.open"), count: countIn(reservations, open, period), figure: reservationValue(reservations, open, period), sub: true },
    { key: "collected", label: t("admin.reports.collectedMetric"), count: countIn(reservations, ["collected"], period), figure: reservationValue(reservations, ["collected"], period), sub: true },
    { key: "closed", label: t("admin.reports.closedUnfulfilled"), count: countIn(reservations, closed, period), figure: reservationValue(reservations, closed, period), sub: true },
  ];
  const money: typeof rows = [
    { key: "received", label: t("admin.reports.paymentsReceived"), count: paymentsIn(reservations, period).length, figure: paymentsReceived(reservations, period) },
    { key: "outstanding", label: t("admin.reports.outstanding"), count: outstandingRows(reservations).length, figure: outstandingAtPickup(reservations) },
  ];
  const cell = (figure: Money[], code: (typeof SUPPORTED_CURRENCIES)[number]) => (figure.some((m) => m.currency === code) ? formatMoney({ amount: amountIn(figure, code) , currency: code }, locale) : "—");
  const shownFrom = period.from ? fmt.date(period.from, "short") : t("admin.reports.allDates");
  const shownTo = period.to ? fmt.date(period.to, "short") : t("admin.reports.allDates");

  const table = (title: string, id: string, list: typeof rows) => (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface">
      <h2 id={id} className="text-h3 border-b border-line px-5 py-4">{title}</h2>
      <div className="relative overflow-x-auto">
        <table className="text-label w-full min-w-[34rem] text-left font-normal">
          <caption className="sr-only">{title}</caption>
          <thead className="text-caption text-ink-muted"><tr>
            <th scope="col" className="px-5 py-2 font-medium">{t("admin.reports.metric")}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t("admin.reports.count")}</th>
            {SUPPORTED_CURRENCIES.map((c) => <th key={c} scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">{t("admin.reports.value")} </span>{c}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-line">
            {list.map((r) => (
              <tr key={r.key}>
                <th scope="row" className={`px-5 py-3 text-left font-normal ${r.sub ? "pl-9 text-ink-soft" : "font-semibold"}`}>{r.label}</th>
                <td className="px-3 py-3 text-right tabular-nums">{r.count}</td>
                {SUPPORTED_CURRENCIES.map((c) => <td key={c} className="text-price px-3 py-3 text-right">{cell(r.figure, c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      <p className="text-caption text-ink-soft">{t("admin.reports.note")}</p>
      <fieldset className="min-w-0 rounded-card border border-line bg-surface p-4">
        <legend className="text-label px-1 font-semibold">{t("admin.reports.periodTitle")}</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
          <TextField label={t("admin.reports.from")} type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} />
          <TextField label={t("admin.reports.to")} type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} />
        </div>
        <p role="status" className="text-caption mt-3 text-ink-soft">{t("admin.reports.periodShown", { from: shownFrom, to: shownTo })}</p>
      </fieldset>
      {table(t("admin.reports.reservationsTitle"), "rep-res", rows)}
      {table(t("admin.reports.paymentsTitle"), "rep-pay", money)}
      <p className="text-caption text-ink-muted">{t("admin.reports.taxNote")}</p>
    </div>
  );
}
