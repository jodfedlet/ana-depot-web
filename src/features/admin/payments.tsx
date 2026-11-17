"use client";

import { Search } from "lucide-react";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { listPayments } from "@/lib/api/admin/endpoints";
import { useAdminResource } from "@/lib/api/admin/hooks";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { PaymentAttemptsView } from "./payment-attempts";
import { RefreshButton, useMoneyText, useUrlState } from "./common";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";

/** Every recorded payment (server-side filters and paging), newest first. Recording, reversing and adjusting happen on the reservation, where the balances are. */
export function PaymentsView() {
  const t = useT();
  const tab = useUrlState("/admin/payments");
  const attempts = tab.get("view") === "attempts";
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t("admin.payments.title")} className="flex gap-2">
        {([["", t("adminPay.tabPayments")], ["attempts", t("adminPay.tabAttempts")]] as const).map(([v, label]) => (
          <button key={v} type="button" role="tab" aria-selected={(tab.get("view") === v)} onClick={() => tab.set({ view: v || undefined, page: undefined })}
            className={`text-label min-h-11 rounded-control border px-4 font-semibold ${tab.get("view") === v ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong bg-surface text-ink hover:bg-sand-50"}`}>{label}</button>
        ))}
      </div>
      {attempts ? <PaymentAttemptsView /> : <CashAndCardPayments />}
    </div>
  );
}

function CashAndCardPayments() {
  const t = useT();
  const fmt = useFormat();
  const money = useMoneyText();
  const url = useUrlState("/admin/payments");
  const method = url.get("method"), currency = url.get("currency"), from = url.get("from"), to = url.get("to"), reversed = url.get("reversed");
  const page = Math.max(0, Number(url.get("page")) || 0);
  const res = useAdminResource(`payments:${method}:${currency}:${from}:${to}:${reversed}:${page}`, (signal) => listPayments({ method: method || undefined, currency: currency || undefined, from: from || undefined, to: to || undefined, reversed: reversed || undefined, page, size: 20 }, { signal }));
  const hasFilters = !!(method || currency || from || to || reversed);
  return (
    <div className="space-y-4">
      <p className="text-caption text-ink-soft">{t("admin.payments.note")}</p>
      <form onSubmit={(e) => e.preventDefault()} className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div><label htmlFor="pmethod" className="text-caption mb-1 block text-ink-muted">{t("adminPay.filterMethod")}</label><select id="pmethod" value={method} onChange={(e) => url.set({ method: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("adminPay.allMethods")}</option><option value="CASH_AT_PICKUP">{t("adminPay.methodCash")}</option><option value="STRIPE_CHECKOUT">{t("adminPay.methodStripe")}</option></select></div>
        <div><label htmlFor="pcur" className="text-caption mb-1 block text-ink-muted">{t("admin.payments.filterCurrency")}</label><select id="pcur" value={currency} onChange={(e) => url.set({ currency: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("admin.payments.allCurrencies")}</option>{SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label htmlFor="pfrom" className="text-caption mb-1 block text-ink-muted">{t("admin.list.from")}</label><input id="pfrom" type="date" value={from} onChange={(e) => url.set({ from: e.target.value || undefined })} className={`${field} w-full`} /></div>
        <div><label htmlFor="pto" className="text-caption mb-1 block text-ink-muted">{t("admin.list.to")}</label><input id="pto" type="date" value={to} onChange={(e) => url.set({ to: e.target.value || undefined })} className={`${field} w-full`} /></div>
        <div><label htmlFor="prev" className="text-caption mb-1 block text-ink-muted">{t("adminRes.reversalFilter")}</label><select id="prev" value={reversed} onChange={(e) => url.set({ reversed: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("admin.list.allStatuses")}</option><option value="false">{t("adminRes.notReversed")}</option><option value="true">{t("adminRes.reversed")}</option></select></div>
        <div className="flex items-end"><RefreshButton onClick={res.reload} loading={res.loading} /></div>
      </form>
      {res.error != null && !res.data ? <AdminErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <div role="status" aria-label={t("adminCommon.loading")}><Skeleton className="h-64 w-full" /></div> : (
        <>
          <p role="status" className="text-label font-normal text-ink-soft">{t("admin.payments.count", { count: res.data.totalItems })}{hasFilters && <Button variant="ghost" size="sm" className="ml-2" onClick={url.clear}>{t("adminCommon.clearFilters")}</Button>}</p>
          {res.data.items.length === 0 ? (
            <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Search aria-hidden />} title={hasFilters ? t("admin.payments.noMatchTitle") : t("admin.payments.emptyTitle")} description={hasFilters ? t("admin.payments.noMatchText") : t("admin.payments.emptyText")} /></div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-surface" aria-busy={res.loading}>
              <table className="w-full min-w-[50rem] text-left">
                <caption className="sr-only">{t("admin.payments.title")}</caption>
                <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted"><tr><th scope="col" className="px-3 py-3 font-medium">{t("admin.payments.columns.date")}</th><th scope="col" className="px-3 py-3 font-medium">{t("admin.payments.columns.reservation")}</th><th scope="col" className="px-3 py-3 text-right font-medium">{t("admin.payments.columns.amount")}</th><th scope="col" className="px-3 py-3 font-medium">{t("adminPay.filterMethod")}</th><th scope="col" className="px-3 py-3 font-medium">{t("admin.payments.columns.reference")}</th><th scope="col" className="px-3 py-3 font-medium">{t("admin.products.status")}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {res.data.items.map((p) => (
                    <tr key={p.id} className="text-label align-top font-normal hover:bg-sand-50">
                      <td className="whitespace-nowrap px-3 py-3 text-ink-soft">{fmt.dateTime(p.receivedAt)}</td>
                      <th scope="row" className="px-3 py-3 text-left font-semibold" translate="no"><Link href={`/admin/reservations/${p.reservationReference}`} className="hover:underline">{p.reservationReference}</Link></th>
                      <td className={`px-3 py-3 text-right tabular-nums ${p.reversed ? "text-ink-muted line-through" : "font-semibold"}`}>{money(p.amount, p.currency)}</td>
                      <td className="px-3 py-3"><Badge tone={p.method === "STRIPE_CHECKOUT" ? "info" : "neutral"}>{p.method === "STRIPE_CHECKOUT" ? t("adminPay.methodStripe") : t("adminPay.methodCash")}</Badge></td>
                      <td className="px-3 py-3 font-mono text-xs break-all text-ink-soft">{p.reference ?? "—"}</td>
                      <td className="px-3 py-3">{p.reversed ? <Badge tone="danger">{t("adminRes.reversed")}</Badge> : <Badge tone="success">{t("adminRes.valid")}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {res.data.totalPages > 1 && (
            <nav className="flex items-center justify-between gap-3" aria-label={t("admin.list.pagination")}>
              <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => url.set({ page: String(page - 1) }, true)}>{t("adminCommon.previous")}</Button>
              <span className="text-label font-normal text-ink-soft">{t("adminCommon.page", { page: page + 1, count: res.data.totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= res.data.totalPages} onClick={() => url.set({ page: String(page + 1) }, true)}>{t("adminCommon.next")}</Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
