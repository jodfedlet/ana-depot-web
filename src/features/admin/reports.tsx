"use client";

import { useState } from "react";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Skeleton } from "@/components/ui/states";
import { useFormat } from "@/i18n/format";
import { useT } from "@/i18n/provider";
import { useAdminResource } from "@/lib/api/admin/hooks";
import { reportPayments, reportProducts, reportReservations, reportSales, reportStock } from "@/lib/api/admin/endpoints";
import type { CurrencyMap, PaymentsReport, ProductsReport, ReservationsReport, SalesReport, StockReport } from "@/lib/api/admin/dto";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { CurrencyFigures, PeriodFilter, RefreshButton, useMoneyText, useUrlState } from "./common";

const TABS = ["sales", "payments", "products", "reservations", "stock"] as const;
type Tab = (typeof TABS)[number];
const GROUPS = ["DAY", "WEEK", "MONTH"] as const;
type ReportResult =
  | { tab: "sales"; data: SalesReport }
  | { tab: "payments"; data: PaymentsReport }
  | { tab: "products"; data: ProductsReport }
  | { tab: "reservations"; data: ReservationsReport }
  | { tab: "stock"; data: StockReport };
const select = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";

/** Money cells: one column per supported currency, never summed. */
function CurrencyCells({ values }: { values: CurrencyMap | undefined }) {
  const money = useMoneyText();
  return <>{SUPPORTED_CURRENCIES.map((c) => <td key={c} className="text-price px-2 py-2.5 text-right">{values && values[c] !== undefined ? money(values[c], c) : "—"}</td>)}</>;
}
const CurrencyHeads = ({ label }: { label: string }) => <>{SUPPORTED_CURRENCIES.map((c) => <th key={c} scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">{label} </span>{c}</th>)}</>;

export function ReportsView() {
  const t = useT();
  const fmt = useFormat();
  const url = useUrlState("/admin/reports");
  const tab = (TABS.find((x) => x === url.get("tab")) ?? "sales") as Tab;
  const from = url.get("from"), to = url.get("to");
  const groupBy = GROUPS.find((g) => g === url.get("group")) ?? "DAY";
  const currency = url.get("currency");
  const range = { from: from || undefined, to: to || undefined };

  const res = useAdminResource<ReportResult>(`report:${tab}:${from}:${to}:${groupBy}:${currency}`, (signal): Promise<ReportResult> => {
    switch (tab) {
      case "sales": return reportSales({ ...range, groupBy }, { signal }).then((data) => ({ tab, data }) as ReportResult);
      case "payments": return reportPayments({ ...range, groupBy }, { signal }).then((data) => ({ tab, data }) as ReportResult);
      case "products": return reportProducts({ ...range, currency: currency || undefined, limit: 20 }, { signal }).then((data) => ({ tab, data }) as ReportResult);
      case "reservations": return reportReservations(range, { signal }).then((data) => ({ tab, data }) as ReportResult);
      case "stock": return reportStock({ signal }).then((data) => ({ tab, data }) as ReportResult);
    }
  });
  const money = useMoneyText();
  const [showEmpty, setShowEmpty] = useState(false);
  const result = res.data && res.data.tab === tab ? res.data : null;
  const isZero = (m: CurrencyMap | undefined) => !m || Object.values(m).every((v) => Number(v) === 0);

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <p className="text-caption text-ink-soft">{t("adminDash.moneyNote")}</p>
      <div role="tablist" aria-label={t("admin.reports.title")} className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((x) => (
          <button key={x} role="tab" type="button" aria-selected={x === tab} onClick={() => url.set({ tab: x }, true)} className={cn("text-label min-h-11 border-b-2 px-4 font-semibold", x === tab ? "border-brand-700 text-brand-800" : "border-transparent text-ink-soft hover:text-ink")}>{t(`adminDash.tabs.${x}`)}</button>
        ))}
      </div>

      {tab !== "stock" && (
        <PeriodFilter from={from} to={to} onChange={(p) => url.set({ from: p.from || undefined, to: p.to || undefined })}>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {(tab === "sales" || tab === "payments") && (
              <div><label htmlFor="grp" className="text-caption mb-1 block text-ink-muted">{t("adminDash.groupBy")}</label>
                <select id="grp" className={select} value={groupBy} onChange={(e) => url.set({ group: e.target.value }, true)}>{GROUPS.map((g) => <option key={g} value={g}>{t(`adminDash.group.${g}`)}</option>)}</select></div>
            )}
            {tab === "products" && (
              <div><label htmlFor="cur" className="text-caption mb-1 block text-ink-muted">{t("adminDash.productsCurrency")}</label>
                <select id="cur" className={select} value={currency} onChange={(e) => url.set({ currency: e.target.value || undefined }, true)}><option value="">{t("adminDash.allCurrencies")}</option>{SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            )}
            <RefreshButton onClick={res.reload} loading={res.loading} />
          </div>
        </PeriodFilter>
      )}
      {tab === "stock" && <RefreshButton onClick={res.reload} loading={res.loading} />}

      {res.error != null ? <AdminErrorState error={res.error} onRetry={res.reload} />
        : !result ? <div role="status" aria-label={t("adminCommon.loading")}><Skeleton className="h-64 w-full" /></div>
        : (
          <section aria-busy={res.loading} className="min-w-0 max-w-full overflow-hidden rounded-card border border-line bg-surface">
            {result.tab !== "stock" && <p className="text-caption border-b border-line px-5 py-3 text-ink-soft">{t("adminDash.periodShown", { from: result.data.period.from, to: result.data.period.to })}</p>}

            {result.tab === "sales" && (() => {
              const active = result.data.buckets.filter((b) => b.reservations > 0 || !isZero(b.collected));
              const rows = showEmpty ? result.data.buckets : active;
              return (
                <>
                  <div className="grid gap-4 border-b border-line p-5 sm:grid-cols-2">
                    <div><p className="text-caption font-medium text-ink-soft">{t("adminDash.salesTotal")} · {t("adminDash.reservationsCount")}</p><p className="font-display text-3xl tabular-nums">{result.data.reservations}</p></div>
                    <div className="text-lg"><CurrencyFigures values={result.data.totals} /></div>
                  </div>
                  <p className="text-caption px-5 pt-3 text-ink-muted">{t("adminDash.salesNote")}</p>
                  {rows.length === 0 ? <p className="text-label px-5 py-8 text-center font-normal text-ink-soft">{t("adminDash.noSalesDays")}</p> : (
                    <div className="overflow-x-auto">
                      <table className="text-label w-full min-w-[20rem] text-left font-normal">
                        <thead className="text-caption text-ink-muted"><tr><th scope="col" className="px-4 py-2 font-medium">{t("adminDash.bucketStart")}</th><th scope="col" className="px-2 py-2 text-right font-medium">{t("adminDash.reservationsCount")}</th><CurrencyHeads label={t("adminDash.value")} /></tr></thead>
                        <tbody className="divide-y divide-line">{rows.map((b) => <tr key={b.start}><th scope="row" className="px-4 py-2.5 font-normal">{fmt.date(b.start, "short")}</th><td className="px-2 py-2.5 text-right tabular-nums">{b.reservations}</td><CurrencyCells values={b.collected} /></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                  {active.length < result.data.buckets.length && <div className="border-t border-line px-5 py-3"><Button variant="ghost" size="sm" onClick={() => setShowEmpty((v) => !v)}>{showEmpty ? t("adminDash.hideEmpty") : t("adminDash.showEmpty")}</Button></div>}
                </>
              );
            })()}

            {result.tab === "payments" && (
              <>
                <p className="text-caption px-5 pt-3 text-ink-muted">{t("adminDash.paymentsNote")}</p>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <div key={c} className="overflow-x-auto border-t border-line first:border-t-0">
                    <table className="text-label w-full min-w-[24rem] text-left font-normal">
                      <caption className="text-label px-4 pb-1 pt-3 text-left font-semibold">{c}</caption>
                      <thead className="text-caption text-ink-muted"><tr><th scope="col" className="px-5 py-2 font-medium">{t("adminDash.bucketStart")}</th>{(["payReceived", "payReversed", "payAdjustments", "payNet"] as const).map((k) => <th key={k} scope="col" className="px-3 py-2 text-right font-medium">{t(`adminDash.${k}`)}</th>)}</tr></thead>
                      <tbody className="divide-y divide-line">
                        <tr className="bg-sand-50 font-semibold"><th scope="row" className="px-4 py-2.5">{t("adminDash.salesTotal")}</th>{([result.data.totals.received, result.data.totals.reversed, result.data.totals.adjustments, result.data.totals.net]).map((m, i) => <td key={i} className="text-price px-2 py-2.5 text-right">{m[c] !== undefined ? money(m[c], c) : "—"}</td>)}</tr>
                        {result.data.buckets.filter((b) => showEmpty || ![b.received, b.reversed, b.adjustments, b.net].every((m) => Number(m[c] ?? 0) === 0)).map((b) => <tr key={b.start}><th scope="row" className="px-4 py-2.5 font-normal">{b.start ? fmt.date(b.start, "short") : ""}</th>{([b.received, b.reversed, b.adjustments, b.net]).map((m, i) => <td key={i} className="text-price px-2 py-2.5 text-right">{m[c] !== undefined ? money(m[c], c) : "—"}</td>)}</tr>)}
                      </tbody>
                    </table>
                  </div>
                ))}
                {result.data.receivedByMethod && Object.keys(result.data.receivedByMethod).length > 0 && (
                  <section aria-labelledby="pay-by-method" className="border-t border-line px-5 py-4">
                    <h3 id="pay-by-method" className="text-label font-semibold">{t("adminDash.payByMethod")}</h3>
                    <p className="text-caption mt-1 text-ink-muted">{t("adminDash.payByMethodNote")}</p>
                    <div className="mt-3 overflow-x-auto">
                      <table className="text-label w-full min-w-[20rem] text-left font-normal">
                        <thead className="text-caption text-ink-muted"><tr><th scope="col" className="py-2 pr-3 font-medium">{t("admin.payments.columns.method")}</th>{SUPPORTED_CURRENCIES.map((c) => <th key={c} scope="col" className="px-2 py-2 text-right font-medium">{c}</th>)}</tr></thead>
                        <tbody className="divide-y divide-line">
                          {Object.entries(result.data.receivedByMethod).map(([method, amounts]) => {
                            const key = method.toLowerCase();
                            return (
                              <tr key={method}>
                                <th scope="row" className="py-2.5 pr-3 font-normal">{key === "cash_at_pickup" || key === "stripe_checkout" ? t(`paymentMethod.${key}` as const) : t("paymentMethod.other")}</th>
                                {SUPPORTED_CURRENCIES.map((c) => <td key={c} className="text-price px-2 py-2.5 text-right">{amounts[c] !== undefined ? money(amounts[c], c) : "—"}</td>)}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                <div className="border-t border-line px-5 py-3"><Button variant="ghost" size="sm" onClick={() => setShowEmpty((v) => !v)}>{showEmpty ? t("adminDash.hideEmpty") : t("adminDash.showEmpty")}</Button></div>
              </>
            )}

            {result.tab === "products" && (
              result.data.rows.length === 0 ? <p className="text-label px-5 py-10 text-center font-normal text-ink-soft">{t("adminDash.empty")}</p> : (
                <div className="overflow-x-auto">
                  <table className="text-label w-full min-w-[36rem] text-left font-normal">
                    <thead className="text-caption text-ink-muted"><tr><th scope="col" className="px-5 py-2 font-medium">{t("adminDash.productName")}</th><th scope="col" className="px-3 py-2 font-medium">{t("adminDash.productsCurrency")}</th><th scope="col" className="px-3 py-2 text-right font-medium">{t("adminDash.productQty")}</th><th scope="col" className="px-3 py-2 text-right font-medium">{t("adminDash.productReservations")}</th><th scope="col" className="px-5 py-2 text-right font-medium">{t("adminDash.productRevenue")}</th></tr></thead>
                    <tbody className="divide-y divide-line">{result.data.rows.map((r) => <tr key={`${r.productId}-${r.currency}`}><th scope="row" className="px-5 py-2.5 font-normal">{r.name} <span className="text-caption text-ink-muted">{r.sku}</span></th><td className="px-3 py-2.5">{r.currency}</td><td className="px-3 py-2.5 text-right tabular-nums">{r.quantity}</td><td className="px-3 py-2.5 text-right tabular-nums">{r.reservations}</td><td className="text-price px-5 py-2.5 text-right">{money(r.revenue, r.currency)}</td></tr>)}</tbody>
                  </table>
                </div>
              )
            )}

            {result.tab === "reservations" && (
              <div className="grid gap-px bg-line md:grid-cols-2">
                <div className="bg-surface p-5">
                  <h3 className="text-label font-semibold">{t("adminDash.byStatus")} <span className="font-normal text-ink-soft">· {t("adminDash.reservationsTotal")} : {result.data.total}</span></h3>
                  <dl className="mt-3 space-y-1.5">{Object.entries(result.data.byStatus).map(([s, n]) => <div key={s} className="flex justify-between gap-3"><dt className="text-label font-normal text-ink-soft">{t(`status.${s.toLowerCase() as "confirmed"}`)}</dt><dd className="tabular-nums">{n}</dd></div>)}</dl>
                </div>
                <div className="bg-surface p-5">
                  <h3 className="text-label font-semibold">{t("adminDash.rejectionReasons")}</h3>
                  {Object.keys(result.data.rejectionReasons).length === 0 ? <p className="text-caption mt-3 text-ink-soft">{t("adminDash.noRejections")}</p> : (
                    <dl className="mt-3 space-y-1.5">{Object.entries(result.data.rejectionReasons).map(([r, n]) => <div key={r} className="flex justify-between gap-3"><dt className="text-label font-normal text-ink-soft">{t(`rejectReasons.${r.toLowerCase() as "other"}`)}</dt><dd className="tabular-nums">{n}</dd></div>)}</dl>
                  )}
                </div>
              </div>
            )}

            {result.tab === "stock" && (
              <div className="p-5">
                <h3 className="text-label font-semibold">{t("adminDash.stockNow")}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {([["stockOk", result.data.stock.ok], ["stockLow", result.data.stock.low], ["stockOut", result.data.stock.out], ["stockUntracked", result.data.stock.untracked], ["stockNoRecord", result.data.stock.activeProductsWithoutStockRecord], ["activeProducts", result.data.activeProducts]] as const).map(([k, n]) => (
                    <div key={k} className="rounded-control border border-line p-3"><dt className="text-caption text-ink-soft">{t(`adminDash.${k}`)}</dt><dd className="font-display text-2xl tabular-nums">{n}</dd></div>
                  ))}
                </dl>
                <p className="text-caption mt-4 text-ink-muted">{t("adminDash.stockNote")}</p>
              </div>
            )}
          </section>
        )}
    </div>
  );
}
