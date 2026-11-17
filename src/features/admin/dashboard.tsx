"use client";

import { MapPin } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/states";
import { ReservationStatusBadge, reservationStatusTone } from "@/features/reservations/shared";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLText, useT } from "@/i18n/provider";
import { useAdminResource } from "@/lib/api/admin/hooks";
import { getPickupSettings, listInventory, listReservations, reportOverview, reportProducts } from "@/lib/api/admin/endpoints";
import { cn } from "@/lib/cn";
import { reservationStatuses, type ReservationStatus as UiStatus } from "@/lib/reservations/types";
import { CurrencyFigures, PeriodFilter, RefreshButton, useMoneyText, useUrlState } from "./common";

const toneBar: Record<string, string> = { warning: "bg-warning-fg", info: "bg-info-fg", success: "bg-success-fg", brand: "bg-brand-700", danger: "bg-danger-fg", neutral: "bg-line-strong" };
const lower = (s: string) => s.toLowerCase() as UiStatus;
const OPEN = ["PENDING_REVIEW", "CONFIRMED", "READY_FOR_PICKUP"] as const;

/**
 * The administration home. Every figure is a server-side aggregate from the reporting API (or a short list from the list endpoints): nothing is computed from a
 * downloaded dataset, nothing is invented, and HTG and USD are always shown apart. Where the API has no figure (a total of balances due) the screen says so.
 */
export function Dashboard() {
  const t = useT();
  const lt = useLText();
  const fmt = useFormat();
  const money = useMoneyText();
  const url = useUrlState("/admin");
  const from = url.get("from"), to = url.get("to");
  const range = { from: from || undefined, to: to || undefined };

  const res = useAdminResource(`dashboard:${from}:${to}`, async (signal) => {
    const [overview, top, pending, ready, recent, low, out, pickup] = await Promise.all([
      reportOverview(range, { signal }),
      reportProducts({ ...range, limit: 5 }, { signal }),
      listReservations({ status: "PENDING_REVIEW", sort: "OLDEST", size: 5 }, { signal }),
      listReservations({ status: "READY_FOR_PICKUP", sort: "OLDEST", size: 20 }, { signal }),
      listReservations({ size: 5 }, { signal }),
      listInventory({ state: "LOW", size: 5 }, { signal }),
      listInventory({ state: "OUT", size: 5 }, { signal }),
      getPickupSettings({ signal }),
    ]);
    return { overview, top, pending, ready, recent, low, out, pickup, loadedAt: new Date() };
  });

  if (res.error != null && !res.data) return <AdminErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <div role="status" aria-label={t("adminCommon.loading")}><Skeleton className="h-24 w-full" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  const { overview, top, pending, ready, recent, low, out, pickup, loadedAt } = res.data;
  const awaiting = ready.items.filter((r) => r.paymentStatus !== "PAID").slice(0, 5);
  const pickupState = !pickup.enabled ? "off" : pickup.location?.storeName && pickup.location.addressLine && pickup.location.city && pickup.location.phone ? "on" : "none";

  return (
    <div className="space-y-6" aria-busy={res.loading}>
      {res.error != null && <AdminErrorState error={res.error} onRetry={res.reload} />}
      <PeriodFilter from={from} to={to} onChange={(p) => url.set({ from: p.from || undefined, to: p.to || undefined })}>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <RefreshButton onClick={res.reload} loading={res.loading} />
          <p role="status" className="text-caption text-ink-soft">{t("adminDash.periodShown", { from: overview.period.from, to: overview.period.to })} · {t("adminCommon.updatedAt", { time: fmt.dateTime(loadedAt.toISOString()) })}</p>
        </div>
      </PeriodFilter>

      <section aria-labelledby="open-title">
        <h2 id="open-title" className="text-h3">{t("adminDash.openNow")}</h2>
        <p className="text-caption mt-1 text-ink-soft">{t("adminDash.openNowNote")}</p>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {OPEN.map((s) => (
            <li key={s}>
              <Link href={`/admin/reservations?status=${s}`} className="group relative block h-full overflow-hidden rounded-card border border-line bg-surface p-4 hover:border-line-strong">
                <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", toneBar[reservationStatusTone[lower(s)]])} />
                <p className="text-caption text-ink-soft group-hover:text-ink">{t(`status.${lower(s)}`)}</p>
                <p className="mt-1 font-display text-3xl tabular-nums">{overview.openNow[s] ?? 0}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="created-title">
        <h2 id="created-title" className="text-h3">{t("adminDash.createdTitle")}</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {reservationStatuses.map((s) => (
            <li key={s} className="rounded-card border border-line bg-surface p-4">
              <p className="text-caption text-ink-soft">{t(`status.${s}`)}</p>
              <p className="mt-1 font-display text-2xl tabular-nums">{overview.reservationsCreated[s.toUpperCase()] ?? 0}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="money-title">
        <h2 id="money-title" className="text-h3">{t("adminDash.money")}</h2>
        <p className="text-caption mt-1 text-ink-soft">{t("adminDash.moneyNote")}</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          <li className="rounded-card border border-line bg-surface p-4">
            <p className="text-caption font-medium text-ink-soft">{t("adminDash.received")}</p>
            <div className="mt-2 text-lg"><CurrencyFigures values={overview.paymentsNet} /></div>
            <p className="text-caption mt-2 text-ink-muted">{t("adminDash.receivedNote")}</p>
          </li>
          <li className="rounded-card border border-line bg-surface p-4">
            <p className="text-caption font-medium text-ink-soft">{t("adminDash.collected")}</p>
            <div className="mt-2 text-lg"><CurrencyFigures values={overview.collected} /></div>
            <p className="text-caption mt-2 text-ink-muted">{t("adminDash.collectedNote")}</p>
          </li>
        </ul>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="attn-title" className="rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id="attn-title" className="text-h3">{t("adminDash.needsAttention")} <Badge tone="warning" className="ml-1">{overview.openNow.PENDING_REVIEW ?? 0}</Badge></h2>
            <Link href="/admin/reservations?status=PENDING_REVIEW" className="text-label font-semibold text-brand-700 hover:underline">{t("adminDash.viewAll")}</Link>
          </div>
          {pending.items.length === 0 ? <p className="text-label px-5 py-8 text-center font-normal text-ink-soft">{t("adminDash.needsAttentionEmpty")}</p> : (
            <ul className="divide-y divide-line">
              {pending.items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-label font-semibold" translate="no">{r.reference}</p>
                    <p className="text-caption text-ink-soft">{r.contact.firstName} {r.contact.lastName} · {fmt.dateTime(r.createdAt)}</p>
                    <p className="text-caption text-ink-soft">{r.balances.map((b) => money(b.total, b.currency)).join(" · ")}</p>
                  </div>
                  <ButtonLink href={`/admin/reservations/${r.reference}`} variant="outline" size="sm">{t("adminDash.review")}</ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="await-title" className="rounded-card border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 id="await-title" className="text-h3">{t("adminDash.awaitingPayment")}</h2>
            <p className="text-caption mt-1 text-ink-muted">{t("adminDash.awaitingPaymentNote")}</p>
          </div>
          {awaiting.length === 0 ? <p className="text-label px-5 py-8 text-center font-normal text-ink-soft">{t("adminDash.awaitingEmpty")}</p> : (
            <ul className="divide-y divide-line">
              {awaiting.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/reservations/${r.reference}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-sand-50">
                    <div className="min-w-0 flex-1"><p className="text-label font-semibold" translate="no">{r.reference}</p><p className="text-caption text-ink-soft">{r.contact.firstName} {r.contact.lastName}</p></div>
                    <p className="text-caption text-right text-ink">{r.balances.filter((b) => b.due !== "0.00").map((b) => money(b.due, b.currency)).join(" · ") || "—"}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="top-title" className="rounded-card border border-line bg-surface">
        <div className="border-b border-line px-5 py-4"><h2 id="top-title" className="text-h3">{t("adminDash.topProducts")}</h2><p className="text-caption mt-1 text-ink-muted">{t("adminDash.topProductsNote")}</p></div>
        {top.rows.length === 0 ? <p className="text-label px-5 py-8 text-center font-normal text-ink-soft">{t("adminDash.topEmpty")}</p> : (
          <div className="overflow-x-auto">
            <table className="text-label w-full min-w-[32rem] text-left font-normal">
              <thead className="text-caption text-ink-muted"><tr><th scope="col" className="px-5 py-2 font-medium">{t("adminDash.productName")}</th><th scope="col" className="px-3 py-2 font-medium">{t("adminDash.productsCurrency")}</th><th scope="col" className="px-3 py-2 text-right font-medium">{t("adminDash.productQty")}</th><th scope="col" className="px-5 py-2 text-right font-medium">{t("adminDash.productRevenue")}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {top.rows.map((r) => (
                  <tr key={`${r.productId}-${r.currency}`}><th scope="row" className="px-5 py-2.5 font-normal"><Link href={`/admin/products/${r.productId}`} className="hover:underline">{r.name}</Link> <span className="text-caption text-ink-muted">{r.sku}</span></th><td className="px-3 py-2.5">{r.currency}</td><td className="px-3 py-2.5 text-right tabular-nums">{r.quantity}</td><td className="text-price px-5 py-2.5 text-right">{money(r.revenue, r.currency)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="stk-t" className="rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 id="stk-t" className="text-h3">{t("adminDash.stock")}</h2><Link href="/admin/inventory" className="text-label font-semibold text-brand-700 hover:underline">{t("admin.dashboard.viewInventory")}</Link></div>
          <dl className="grid grid-cols-2 gap-px bg-line text-center sm:grid-cols-5">
            {([["stockOk", overview.stock.ok], ["stockLow", overview.stock.low], ["stockOut", overview.stock.out], ["stockUntracked", overview.stock.untracked], ["stockNoRecord", overview.stock.activeProductsWithoutStockRecord]] as const).map(([k, n]) => (
              <div key={k} className="bg-surface p-3"><dt className="text-caption text-ink-soft">{t(`adminDash.${k}`)}</dt><dd className="font-display text-2xl tabular-nums">{n}</dd></div>
            ))}
          </dl>
          <div className="grid gap-px bg-line sm:grid-cols-2">
            {([["out", out.items, "danger", t("adminDash.stockOut")], ["low", low.items, "warning", t("adminDash.stockLow")]] as const).map(([k, list, tone, title]) => (
              <div key={k} className="bg-surface p-5">
                <p className="text-label flex items-center gap-2 font-semibold">{title} <Badge tone={tone}>{k === "out" ? out.totalItems : low.totalItems}</Badge></p>
                {list.length === 0 ? <p className="text-caption mt-2 text-ink-soft">—</p> : (
                  <ul className="mt-2 space-y-1.5">{list.map((p) => <li key={p.id}><Link href={`/admin/inventory?q=${encodeURIComponent(p.productSku)}`} className="text-label flex items-baseline justify-between gap-3 font-normal hover:underline"><span className="truncate">{lt({ fr: p.productName.fr ?? "", ht: p.productName.ht ?? "" })}{p.variantSku ? ` · ${p.variantSku}` : ""}</span><span className="tabular-nums text-ink-soft">{p.available ?? 0}</span></Link></li>)}</ul>
                )}
              </div>
            ))}
          </div>
          <p className="text-caption border-t border-line px-5 py-3 text-ink-muted">{t("adminDash.activeProducts")} : {overview.activeProducts} · {t("adminDash.newCustomers")} : {overview.newCustomers}</p>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="pk-title" className="rounded-card border border-line bg-surface p-5">
            <h2 id="pk-title" className="text-h3 flex items-center gap-2"><MapPin aria-hidden className="size-4" />{t("adminDash.pickup")}</h2>
            <div className="mt-3"><Alert tone={pickupState === "on" ? "success" : "warning"} live="polite">{t(pickupState === "on" ? "adminDash.pickupOn" : pickupState === "off" ? "adminDash.pickupOff" : "adminDash.pickupNone")}</Alert></div>
            {pickupState === "on" && <p className="text-label mt-3 font-normal text-ink-soft">{pickup.location?.storeName} — {pickup.location?.addressLine}, {pickup.location?.city}</p>}
            <p className="text-caption mt-2 text-ink-muted">{pickup.holdPeriodDays ? t("adminDash.holdDays", { count: pickup.holdPeriodDays }) : t("adminDash.holdNone")}</p>
            <ButtonLink href="/admin/settings" variant="outline" size="sm" className="mt-4">{t("adminDash.managePickup")}</ButtonLink>
          </section>

          <section aria-labelledby="rc-title" className="rounded-card border border-line bg-surface">
            <h2 id="rc-title" className="text-h3 border-b border-line px-5 py-4">{t("adminDash.recent")}</h2>
            <ul className="divide-y divide-line">
              {recent.items.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/reservations/${r.reference}`} className="flex min-h-14 items-center gap-3 px-5 py-2.5 hover:bg-sand-50">
                    <div className="min-w-0 flex-1"><p className="text-label whitespace-nowrap font-semibold" translate="no">{r.reference}</p><p className="text-caption truncate text-ink-soft">{r.contact.firstName} {r.contact.lastName}</p></div>
                    <ReservationStatusBadge status={lower(r.status)} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
