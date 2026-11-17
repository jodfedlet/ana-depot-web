"use client";

import { Search } from "lucide-react";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import type { AdminPaymentAttempt, PaymentAttemptStatus } from "@/lib/api/admin/dto";
import { listPaymentAttempts } from "@/lib/api/admin/endpoints";
import { useAdminResource } from "@/lib/api/admin/hooks";
import { RefreshButton, useMoneyText, useUrlState } from "./common";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";
export const attemptTone: Record<PaymentAttemptStatus, Tone> = { PENDING: "warning", PROCESSING: "info", SUCCEEDED: "success", FAILED: "danger", EXPIRED: "neutral" };
const STATUSES: PaymentAttemptStatus[] = ["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "EXPIRED"];

/** The reservation an attempt belongs to (a dash if the API did not say). */
function RefLink({ a }: { a: AdminPaymentAttempt }) {
  return a.reservationReference ? <Link href={`/admin/reservations/${a.reservationReference}`} className="hover:underline">{a.reservationReference}</Link> : <span className="text-ink-muted">—</span>;
}

export function AttemptBadge({ attempt }: { attempt: Pick<AdminPaymentAttempt, "status" | "requiresAttention"> }) {
  const t = useT();
  return <span className="inline-flex flex-wrap gap-1"><Badge tone={attemptTone[attempt.status]}>{t(`adminPay.attemptStatus.${attempt.status}`)}</Badge>{attempt.requiresAttention && <Badge tone="danger">{t("adminPay.attention")}</Badge>}</span>;
}

/** Hosted-Checkout attempts, read-only. Staff cannot mark an attempt paid (the backend refuses it); an attempt becomes a payment only after Stripe's signed confirmation. */
export function PaymentAttemptsView() {
  const t = useT();
  const fmt = useFormat();
  const money = useMoneyText();
  const url = useUrlState("/admin/payments");
  const status = url.get("astatus"), attention = url.get("attention"), page = Math.max(0, Number(url.get("page")) || 0);
  const res = useAdminResource(`attempts:${status}:${attention}:${page}`, (signal) => listPaymentAttempts({ status: status || undefined, requiresAttention: attention || undefined, page, size: 20 }, { signal }));
  const hasFilters = !!(status || attention);
  return (
    <div className="space-y-4">
      <p className="text-caption text-ink-soft">{t("adminPay.attemptsNote")}</p>
      <form onSubmit={(e) => e.preventDefault()} className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-3">
        <div><label htmlFor="astatus" className="text-caption mb-1 block text-ink-muted">{t("admin.products.status")}</label><select id="astatus" value={status} onChange={(e) => url.set({ astatus: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("adminPay.allStatuses")}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`adminPay.attemptStatus.${s}`)}</option>)}</select></div>
        <div className="flex items-end"><label className="text-label inline-flex min-h-11 items-center gap-2 font-normal"><input type="checkbox" checked={attention === "true"} onChange={(e) => url.set({ attention: e.target.checked ? "true" : undefined })} className="size-4" />{t("adminPay.onlyAttention")}</label></div>
        <div className="flex items-end"><RefreshButton onClick={res.reload} loading={res.loading} /></div>
      </form>
      {res.error != null && !res.data ? <AdminErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <div role="status" aria-label={t("adminCommon.loading")}><Skeleton className="h-64 w-full" /></div> : (
        <>
          <p role="status" className="text-label font-normal text-ink-soft">{t("adminPay.attemptsCount", { count: res.data.totalItems })}{hasFilters && <Button variant="ghost" size="sm" className="ml-2" onClick={() => url.set({ astatus: undefined, attention: undefined })}>{t("adminCommon.clearFilters")}</Button>}</p>
          {res.data.items.some((a) => a.requiresAttention) && <Alert tone="warning">{t("adminPay.attentionNote")}</Alert>}
          {res.data.items.length === 0 ? (
            <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Search aria-hidden />} title={t("adminPay.emptyTitle")} description={t("adminPay.emptyText")} /></div>
          ) : (
            <>
            <ul className="space-y-3 md:hidden" aria-busy={res.loading}>
              {res.data.items.map((a) => (
                <li key={a.id} className={`rounded-card border border-line p-4 ${a.requiresAttention ? "bg-warning-bg/40" : "bg-surface"}`}>
                  <div className="flex items-start justify-between gap-3"><p className="text-label font-semibold tabular-nums">{money(a.amount, a.currency)}</p><AttemptBadge attempt={a} /></div>
                  <p className="text-caption mt-1 text-ink-soft">{fmt.dateTime(a.createdAt)}</p>
                  <p className="text-label mt-2 font-semibold" translate="no"><RefLink a={a} /></p>
                  {a.failureCode && <p className="text-caption mt-1 text-ink-muted">{t("adminPay.columns.failure")}: {a.failureCode}</p>}
                  {a.providerPaymentIntentId && <p className="text-caption mt-2 font-mono break-all text-ink-muted">{a.providerPaymentIntentId}</p>}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block" aria-busy={res.loading}>
              <table className="w-full min-w-[52rem] text-left">
                <caption className="sr-only">{t("adminPay.attemptsTitle")}</caption>
                <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted"><tr>
                  <th scope="col" className="px-3 py-3 font-medium">{t("adminPay.columns.created")}</th><th scope="col" className="px-3 py-3 font-medium">{t("adminPay.columns.reservation")}</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">{t("adminPay.columns.amount")}</th><th scope="col" className="px-3 py-3 font-medium">{t("adminPay.columns.status")}</th>
                  <th scope="col" className="px-3 py-3 font-medium">{t("adminPay.columns.session")}</th><th scope="col" className="px-3 py-3 font-medium">{t("adminPay.columns.intent")}</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {res.data.items.map((a) => (
                    <tr key={a.id} className={`text-label align-top font-normal hover:bg-sand-50 ${a.requiresAttention ? "bg-warning-bg/40" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-3 text-ink-soft">{fmt.dateTime(a.createdAt)}</td>
                      <th scope="row" className="px-3 py-3 text-left font-semibold" translate="no"><RefLink a={a} /></th>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(a.amount, a.currency)}</td>
                      <td className="px-3 py-3"><AttemptBadge attempt={a} />{a.failureCode && <p className="text-caption mt-1 text-ink-muted">{t("adminPay.columns.failure")}: {a.failureCode}</p>}</td>
                      <td className="px-3 py-3 font-mono text-xs break-all text-ink-soft">{a.providerSessionId ?? "—"}</td>
                      <td className="px-3 py-3 font-mono text-xs break-all text-ink-soft">{a.providerPaymentIntentId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
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
