"use client";

import { Search, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MoneyTotals } from "@/components/ui/price";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLocale, useT } from "@/i18n/provider";
import { SUPPORTED_CURRENCIES, formatMoney, sumByCurrency } from "@/lib/money";
import { outstandingRows, paymentsIn } from "@/lib/reports/finance";
import { customerFullName } from "@/lib/reservations/types";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { useReservations } from "@/lib/stores/reservation-store";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";

/**
 * Recorded payments and balances still to be paid, always per currency. Payments are immutable records: each keeps the
 * amount and currency it was received in. Browser-only demo data until the payments endpoints exist.
 */
export function PaymentsView() {
  const t = useT();
  const fmt = useFormat();
  const locale = useLocale();
  const ready = useIsClient();
  const reservations = useReservations();
  const [currency, setCurrency] = useState<"all" | (typeof SUPPORTED_CURRENCIES)[number]>("all");
  const [q, setQ] = useState("");

  const byId = useMemo(() => new Map(reservations.map((r) => [r.id, r])), [reservations]);
  const records = useMemo(() => paymentsIn(reservations).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)), [reservations]);
  const outstanding = useMemo(() => outstandingRows(reservations), [reservations]);
  if (!ready) return <Skeleton className="h-72 w-full" />;

  const needle = q.trim().toLowerCase();
  const shown = records.filter((p) => {
    if (currency !== "all" && p.currency !== currency) return false;
    const r = byId.get(p.reservationId);
    return !needle || `${p.reference} ${r ? customerFullName(r.customer) : ""}`.toLowerCase().includes(needle);
  });
  const shownTotals = sumByCurrency(shown.map((p) => ({ amount: p.amount, currency: p.currency })));
  const dueRows = outstanding.map((x) => ({ ...x, due: currency === "all" ? x.due : x.due.filter((m) => m.currency === currency) })).filter((x) => x.due.length > 0);
  const dueTotals = sumByCurrency(dueRows.flatMap((x) => x.due));

  return (
    <div className="space-y-6">
      <p className="text-caption text-ink-soft">{t("admin.payments.note")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="pcur" className="text-caption mb-1 block text-ink-muted">{t("admin.payments.filterCurrency")}</label>
          <select id="pcur" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)} className={field}>
            <option value="all">{t("admin.payments.allCurrencies")}</option>
            {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="relative sm:w-80">
          <label htmlFor="pq" className="sr-only">{t("admin.payments.search")}</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="pq" type="search" placeholder={t("admin.payments.search")} value={q} onChange={(e) => setQ(e.target.value)} className={`${field} w-full pl-9`} />
        </div>
      </div>

      <section aria-labelledby="out-title" className="rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 id="out-title" className="text-h3">{t("admin.payments.outstandingTitle")}</h2>
          <MoneyTotals totals={dueTotals} inline />
        </div>
        <p className="text-caption px-5 pt-3 text-ink-soft">{t("admin.payments.outstandingText")}</p>
        {dueRows.length === 0 ? <p className="text-label px-5 py-4 font-normal text-ink-soft">{t("admin.payments.noOutstanding")}</p> : (
          <ul className="divide-y divide-line">
            {dueRows.map(({ reservation: r, due }) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <Link href={`/admin/reservations/${r.reference}`} className="text-label font-semibold text-brand-700 hover:underline" aria-label={`${t("admin.payments.open")} ${r.reference}`}><span translate="no">{r.reference}</span></Link>
                  <p className="text-caption text-ink-soft">{customerFullName(r.customer)}</p>
                </div>
                <div className="text-right"><p className="text-caption text-ink-muted">{t("admin.payments.columns.due")}</p><MoneyTotals totals={due} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rec-title" className="rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 id="rec-title" className="text-h3">{t("admin.payments.receivedTitle")} <Badge className="ml-1">{t("admin.payments.count", { count: shown.length })}</Badge></h2>
          <MoneyTotals totals={shownTotals} inline />
        </div>
        {records.length === 0 ? <EmptyState icon={<Wallet aria-hidden />} title={t("admin.payments.emptyTitle")} description={t("admin.payments.emptyText")} />
          : shown.length === 0 ? <EmptyState icon={<Search aria-hidden />} title={t("admin.payments.noMatchTitle")} description={t("admin.payments.noMatchText")} />
          : (
            <div className="overflow-x-auto">
              <table className="text-label w-full min-w-[40rem] text-left font-normal">
                <caption className="sr-only">{t("admin.payments.receivedTitle")}</caption>
                <thead className="text-caption text-ink-muted"><tr>
                  {(["date", "reservation", "customer", "amount", "method", "recordedBy"] as const).map((c) => <th key={c} scope="col" className={`px-5 py-2 font-medium ${c === "amount" ? "text-right" : ""}`}>{t(`admin.payments.columns.${c}`)}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {shown.map((p) => {
                    const r = byId.get(p.reservationId);
                    return (
                      <tr key={p.id}>
                        <td className="px-5 py-3">{fmt.dateTime(p.receivedAt)}</td>
                        <td className="px-5 py-3"><Link href={`/admin/reservations/${p.reference}`} className="font-semibold text-brand-700 hover:underline"><span translate="no">{p.reference}</span></Link></td>
                        <td className="px-5 py-3">{r ? customerFullName(r.customer) : "—"}</td>
                        <td className="text-price px-5 py-3 text-right font-semibold">{formatMoney({ amount: p.amount, currency: p.currency }, locale)}</td>
                        <td className="px-5 py-3">{t("paymentMethod.cash_at_pickup")}</td>
                        <td className="px-5 py-3">{p.staff}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}
