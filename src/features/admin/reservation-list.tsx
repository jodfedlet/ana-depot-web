"use client";

import { ChevronRight, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyTotals } from "@/components/ui/price";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { PaymentStatusBadge, ReservationStatusBadge } from "@/features/reservations/shared";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { sameAddress } from "@/lib/pickup/types";
import { type ReservationFilter, type ReservationSort, filterReservations, reservationSorts } from "@/lib/reservations/query";
import { customerFullName, isOpen, reservationItemCount, reservationStatuses } from "@/lib/reservations/types";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { usePickup } from "@/lib/stores/pickup-store";
import { useReservations } from "@/lib/stores/reservation-store";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";

/** Filters live in the URL so a dashboard tile or a bookmark opens the right view. */
export function ReservationList() {
  const t = useT();
  const fmt = useFormat();
  const router = useLocaleRouter();
  const params = useSearchParams();
  const ready = useIsClient();
  const all = useReservations();
  const { settings } = usePickup();

  const status = reservationStatuses.find((s) => s === params.get("status"));
  const sort = reservationSorts.find((s) => s === params.get("sort")) as ReservationSort | undefined;
  const filter: ReservationFilter = { q: params.get("q") ?? "", status, from: params.get("from") ?? "", to: params.get("to") ?? "", sort, page: Number(params.get("page")) || 1 };
  const result = useMemo(() => filterReservations(all, filter), [all, filter.q, filter.status, filter.from, filter.to, filter.sort, filter.page]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.replace(`/admin/reservations${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  const hasFilters = !!(filter.q || status || filter.from || filter.to);

  if (!ready) return <div role="status" aria-label={t("admin.list.loading")}><Skeleton className="h-11 w-full" /><Skeleton className="mt-4 h-72 w-full" /></div>;

  const pickupCell = (r: (typeof all)[number]) => (
    <div className="min-w-0">
      <p className="truncate">{r.pickup.location.addressLine}</p>
      <p className="text-caption text-ink-muted">{r.pickup.location.city}</p>
      {isOpen(r.status) && !sameAddress(r.pickup.location, settings.location) && <Badge tone="warning" className="mt-1" ><span title={t("admin.list.pickupPreviousHint")}>{t("admin.list.pickupPrevious")}</span></Badge>}
    </div>
  );

  return (
    <div className="space-y-4">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="rq" className="sr-only">{t("admin.list.search")}</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="rq" type="search" defaultValue={filter.q} key={filter.q} placeholder={t("admin.list.search")} onChange={(e) => update({ q: e.target.value || undefined })} className={`${field} w-full pl-9`} />
        </div>
        <div><label htmlFor="rs" className="text-caption mb-1 block text-ink-muted">{t("admin.list.status")}</label>
          <select id="rs" value={status ?? ""} onChange={(e) => update({ status: e.target.value || undefined })} className={`${field} w-full`}>
            <option value="">{t("admin.list.allStatuses")}</option>
            {reservationStatuses.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select></div>
        <div><label htmlFor="rf" className="text-caption mb-1 block text-ink-muted">{t("admin.list.from")}</label><input id="rf" type="date" value={filter.from} onChange={(e) => update({ from: e.target.value || undefined })} className={`${field} w-full`} /></div>
        <div><label htmlFor="rt" className="text-caption mb-1 block text-ink-muted">{t("admin.list.to")}</label><input id="rt" type="date" value={filter.to} onChange={(e) => update({ to: e.target.value || undefined })} className={`${field} w-full`} /></div>
        <div><label htmlFor="ro" className="text-caption mb-1 block text-ink-muted">{t("admin.list.sort")}</label>
          <select id="ro" value={sort ?? "newest"} onChange={(e) => update({ sort: e.target.value === "newest" ? undefined : e.target.value })} className={`${field} w-full`}>
            {reservationSorts.map((s) => <option key={s} value={s}>{t(`admin.list.sortOptions.${s}`)}</option>)}
          </select></div>
      </form>

      <p role="status" className="text-label font-normal text-ink-soft">{t("admin.list.count", { count: result.total })}{hasFilters && <Button variant="ghost" size="sm" className="ml-2" onClick={() => router.replace("/admin/reservations")}>{t("admin.list.resetFilters")}</Button>}</p>

      {result.items.length === 0 ? (
        <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Search aria-hidden />} title={t("admin.list.emptyTitle")} description={t("admin.list.emptyText")}>{hasFilters && <Button onClick={() => router.replace("/admin/reservations")}>{t("admin.list.resetFilters")}</Button>}</EmptyState></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
            <table className="w-full min-w-[56rem] text-left">
              <caption className="sr-only">{t("admin.list.title")}</caption>
              <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted">
                <tr>{(["reference", "customer", "submitted", "items", "total", "payment", "status", "pickup", "actions"] as const).map((c) => <th key={c} scope="col" className={`px-3 py-3 font-medium ${c === "items" || c === "total" ? "text-right" : ""}`}>{t(`admin.list.columns.${c}`)}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.items.map((r) => (
                  <tr key={r.id} className="text-label align-top font-normal hover:bg-sand-50">
                    <th scope="row" className="px-3 py-3 font-semibold" translate="no">{r.reference}{r.isSample && <Badge className="ml-2">{t("common.sample")}</Badge>}</th>
                    <td className="px-3 py-3"><p className="font-medium">{customerFullName(r.customer)}</p><p className="text-caption text-ink-soft">{r.customer.dialCode} {r.customer.phone}</p></td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-soft">{fmt.dateTime(r.createdAt)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{reservationItemCount(r)}</td>
                    <td className="px-3 py-3 text-right"><MoneyTotals totals={r.totals} /></td>
                    <td className="px-3 py-3"><p className="text-caption text-ink-soft">{t("paymentMethod.cash_at_pickup")}</p><PaymentStatusBadge status={r.payment.status} /></td>
                    <td className="px-3 py-3"><ReservationStatusBadge status={r.status} /></td>
                    <td className="max-w-48 px-3 py-3">{pickupCell(r)}</td>
                    <td className="px-3 py-3"><Link href={`/admin/reservations/${r.reference}`} aria-label={t("admin.list.openNamed", { reference: r.reference })} className="inline-flex min-h-9 items-center gap-1 font-semibold text-brand-700 hover:underline">{t("admin.list.open")}<ChevronRight aria-hidden className="size-4" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {result.items.map((r) => (
              <li key={r.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-label font-semibold" translate="no">{r.reference}</p><p className="text-label font-normal">{customerFullName(r.customer)}</p><p className="text-caption text-ink-soft">{r.customer.dialCode} {r.customer.phone}</p></div>
                  <ReservationStatusBadge status={r.status} />
                </div>
                <dl className="text-caption mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-ink-soft">
                  <div><dt>{t("admin.list.columns.submitted")}</dt><dd className="text-ink">{fmt.dateTime(r.createdAt)}</dd></div>
                  <div><dt>{t("admin.list.columns.total")}</dt><dd className="text-ink"><MoneyTotals totals={r.totals} inline /> · {t("admin.list.itemsCount", { count: reservationItemCount(r) })}</dd></div>
                  <div><dt>{t("admin.list.columns.payment")}</dt><dd><PaymentStatusBadge status={r.payment.status} /></dd></div>
                  <div><dt>{t("admin.list.columns.pickup")}</dt><dd className="text-ink">{pickupCell(r)}</dd></div>
                </dl>
                <Link href={`/admin/reservations/${r.reference}`} aria-label={t("admin.list.openNamed", { reference: r.reference })} className="text-label mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-control border border-line-strong font-semibold hover:bg-sand-50">{t("admin.list.open")}</Link>
              </li>
            ))}
          </ul>

          {result.pageCount > 1 && (
            <nav aria-label={t("admin.list.pagination")} className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={result.page <= 1} onClick={() => update({ page: String(result.page - 1) })}>{t("admin.list.previous")}</Button>
              <span className="text-label font-normal text-ink-soft">{t("admin.list.pageOf", { page: result.page, count: result.pageCount })}</span>
              <Button variant="outline" size="sm" disabled={result.page >= result.pageCount} onClick={() => update({ page: String(result.page + 1) })}>{t("admin.list.next")}</Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
