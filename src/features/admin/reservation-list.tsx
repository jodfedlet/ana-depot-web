"use client";

import { ChevronRight, Search } from "lucide-react";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { PaymentStatusBadge, ReservationStatusBadge } from "@/features/reservations/shared";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import type { AdminReservationSummary } from "@/lib/api/admin/dto";
import { listReservations } from "@/lib/api/admin/endpoints";
import { useAdminResource } from "@/lib/api/admin/hooks";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { reservationStatuses } from "@/lib/reservations/types";
import { RefreshButton, useMoneyText, useUrlState } from "./common";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";
const lower = <T extends string>(s: T) => s.toLowerCase() as Lowercase<T>;
const PAGE = 20;
const QUICK = ["PENDING_REVIEW", "CONFIRMED", "READY_FOR_PICKUP", "COLLECTED"] as const;

/** Reservation list: every filter, the search and the paging are the API's (`GET /admin/reservations`); filters live in the URL. */
export function ReservationList() {
  const t = useT();
  const fmt = useFormat();
  const money = useMoneyText();
  const url = useUrlState("/admin/reservations");
  const q = url.get("q"), status = url.get("status"), pay = url.get("paymentStatus"), currency = url.get("currency"), from = url.get("from"), to = url.get("to"), sort = url.get("sort");
  const page = Math.max(0, Number(url.get("page")) || 0);
  const res = useAdminResource(`reservations:${q}:${status}:${pay}:${currency}:${from}:${to}:${sort}:${page}`, (signal) =>
    listReservations({ q: q || undefined, status: status || undefined, paymentStatus: pay || undefined, currency: currency || undefined, from: from || undefined, to: to || undefined, sort: sort || undefined, page, size: PAGE }, { signal }));
  const hasFilters = !!(q || status || pay || currency || from || to);

  const amounts = (r: AdminReservationSummary) => r.balances.map((b) => <p key={b.currency} className="text-caption"><span className="font-semibold text-ink">{money(b.total, b.currency)}</span>{b.due !== "0.00" && <span className="ml-1 text-ink-soft">· {t("admin.detail.labels.due")} {money(b.due, b.currency)}</span>}</p>);

  return (
    <div className="space-y-4">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="space-y-3 rounded-card border border-line bg-surface p-4">
        <div className="relative">
          <label htmlFor="rq" className="sr-only">{t("admin.list.search")}</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="rq" type="search" defaultValue={q} key={q} placeholder={t("admin.list.search")} onKeyDown={(e) => { if (e.key === "Enter") url.set({ q: (e.target as HTMLInputElement).value || undefined }); }} onBlur={(e) => { if (e.target.value !== q) url.set({ q: e.target.value || undefined }); }} className={`${field} w-full pl-9`} />
        </div>
        <div role="group" aria-label={t("admin.list.status")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[["", t("adminRes.quickAll")], ...QUICK.map((s) => [s, t(`status.${lower(s)}`)])].map(([v, label]) => (
            <button key={v} type="button" aria-pressed={status === v} onClick={() => url.set({ status: v || undefined })} className={`text-label min-h-10 shrink-0 rounded-full border px-3.5 font-semibold ${status === v ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line-strong bg-surface text-ink-soft hover:text-ink"}`}>{label}</button>
          ))}
        </div>
        <details open={!!(pay || currency || from || to || sort || (status && !QUICK.includes(status as (typeof QUICK)[number])))} className="group">
          <summary className="text-label min-h-10 cursor-pointer list-none font-semibold text-brand-700 hover:underline">{t("adminRes.moreFilters")}{(pay || currency || from || to || sort) ? ` · ${[pay, currency, from, to, sort].filter(Boolean).length}` : ""}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Sel id="rs" label={t("admin.list.status")} value={status} onChange={(v) => url.set({ status: v || undefined })} all={t("admin.list.allStatuses")} options={reservationStatuses.map((s) => [s.toUpperCase(), t(`status.${s}`)])} />
            <Sel id="rp" label={t("admin.detail.labels.paymentStatus")} value={pay} onChange={(v) => url.set({ paymentStatus: v || undefined })} all={t("admin.list.allStatuses")} options={(["UNPAID", "PARTIAL", "PAID"] as const).map((s) => [s, t(`paymentStatus.${lower(s)}`)])} />
            <Sel id="rc" label={t("adminProd.currency")} value={currency} onChange={(v) => url.set({ currency: v || undefined })} all={t("adminDash.allCurrencies")} options={SUPPORTED_CURRENCIES.map((c) => [c, c])} />
            <div><label htmlFor="rf" className="text-caption mb-1 block text-ink-muted">{t("admin.list.from")}</label><input id="rf" type="date" value={from} onChange={(e) => url.set({ from: e.target.value || undefined })} className={`${field} w-full`} /></div>
            <div><label htmlFor="rt" className="text-caption mb-1 block text-ink-muted">{t("admin.list.to")}</label><input id="rt" type="date" value={to} onChange={(e) => url.set({ to: e.target.value || undefined })} className={`${field} w-full`} /></div>
            <Sel id="ro" label={t("admin.list.sort")} value={sort} onChange={(v) => url.set({ sort: v || undefined })} all={t("admin.list.sortOptions.newest")} options={[["OLDEST", t("admin.list.sortOptions.oldest")]]} />
          </div>
        </details>
      </form>

      {res.error != null && !res.data ? <AdminErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <div role="status" aria-label={t("adminCommon.loading")}><Skeleton className="h-72 w-full" /></div> : (
        <>
          <p role="status" className="text-label font-normal text-ink-soft">{t("admin.list.count", { count: res.data.totalItems })}{hasFilters && <Button variant="ghost" size="sm" className="ml-2" onClick={url.clear}>{t("adminCommon.clearFilters")}</Button>}<span className="ml-2"><RefreshButton onClick={res.reload} loading={res.loading} /></span></p>
          {res.data.items.length === 0 ? (
            <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Search aria-hidden />} title={t("admin.list.emptyTitle")} description={t("admin.list.emptyText")}>{hasFilters && <Button onClick={url.clear}>{t("adminCommon.clearFilters")}</Button>}</EmptyState></div>
          ) : (
            <div aria-busy={res.loading}>
              <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
                <table className="w-full min-w-[52rem] text-left">
                  <caption className="sr-only">{t("admin.list.title")}</caption>
                  <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted"><tr>{(["reference", "customer", "submitted", "items", "total", "payment", "status", "actions"] as const).map((c) => <th key={c} scope="col" className={`px-3 py-3 font-medium ${c === "items" ? "text-right" : ""}`}>{t(`admin.list.columns.${c}`)}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {res.data.items.map((r) => (
                      <tr key={r.id} className="text-label align-top font-normal hover:bg-sand-50">
                        <th scope="row" className="px-3 py-3 font-semibold" translate="no">{r.reference}</th>
                        <td className="px-3 py-3"><p className="font-medium">{r.contact.firstName} {r.contact.lastName}</p><p className="text-caption text-ink-soft">{r.contact.dialCode} {r.contact.phone}</p></td>
                        <td className="whitespace-nowrap px-3 py-3 text-ink-soft">{fmt.dateTime(r.createdAt)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.unitCount}</td>
                        <td className="px-3 py-3">{amounts(r)}</td>
                        <td className="px-3 py-3"><PaymentStatusBadge status={lower(r.paymentStatus)} /></td>
                        <td className="px-3 py-3"><ReservationStatusBadge status={lower(r.status)} /></td>
                        <td className="px-3 py-3"><Link href={`/admin/reservations/${r.reference}`} aria-label={t("admin.list.openNamed", { reference: r.reference })} className="inline-flex min-h-9 items-center gap-1 font-semibold text-brand-700 hover:underline">{t("adminRes.open")}<ChevronRight aria-hidden className="size-4" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden">
                {res.data.items.map((r) => (
                  <li key={r.id} className="rounded-card border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-label font-semibold" translate="no">{r.reference}</p><p className="text-label font-normal">{r.contact.firstName} {r.contact.lastName}</p><p className="text-caption text-ink-soft">{r.contact.dialCode} {r.contact.phone}</p></div><ReservationStatusBadge status={lower(r.status)} /></div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-ink-soft"><div><p className="text-caption">{t("admin.list.columns.submitted")}</p><p className="text-label text-ink">{fmt.dateTime(r.createdAt)}</p></div><div><p className="text-caption">{t("admin.list.columns.payment")}</p><PaymentStatusBadge status={lower(r.paymentStatus)} /></div><div className="col-span-2">{amounts(r)}</div></div>
                    <Link href={`/admin/reservations/${r.reference}`} aria-label={t("admin.list.openNamed", { reference: r.reference })} className="text-label mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-control border border-line-strong font-semibold">{t("adminRes.open")}</Link>
                  </li>
                ))}
              </ul>
              {res.data.totalPages > 1 && (
                <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t("admin.list.pagination")}>
                  <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => url.set({ page: String(page - 1) }, true)}>{t("admin.list.previous")}</Button>
                  <span className="text-label font-normal text-ink-soft">{t("admin.list.pageOf", { page: page + 1, count: res.data.totalPages })}</span>
                  <Button variant="outline" size="sm" disabled={page + 1 >= res.data.totalPages} onClick={() => url.set({ page: String(page + 1) }, true)}>{t("admin.list.next")}</Button>
                </nav>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Sel({ id, label, value, onChange, all, options }: { id: string; label: string; value: string; onChange: (v: string) => void; all: string; options: [string, string][] }) {
  return (
    <div><label htmlFor={id} className="text-caption mb-1 block text-ink-muted">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} w-full`}><option value="">{all}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );
}
