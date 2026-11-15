"use client";

import { Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MoneyTotals } from "@/components/ui/price";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { PaymentStatusBadge, ReservationStatusBadge } from "@/features/reservations/shared";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { type CustomerSummary, groupCustomers } from "@/lib/reservations/customers";
import { reservationItemCount } from "@/lib/reservations/types";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { useReservations } from "@/lib/stores/reservation-store";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";

export function CustomerList() {
  const t = useT();
  const fmt = useFormat();
  const ready = useIsClient();
  const reservations = useReservations();
  const [q, setQ] = useState("");
  const customers = useMemo(() => groupCustomers(reservations), [reservations]);
  if (!ready) return <Skeleton className="h-72 w-full" />;
  const needle = q.trim().toLowerCase();
  const shown = customers.filter((c) => !needle || `${c.name} ${c.dialCode}${c.phone} ${c.email ?? ""}`.toLowerCase().includes(needle) || c.phone.replace(/\D/g, "").includes(needle.replace(/\D/g, "") || "§"));
  return (
    <div className="space-y-4">
      <p className="text-caption text-ink-soft">{t("admin.customers.note")}</p>
      <div className="relative sm:w-80">
        <label htmlFor="cq" className="sr-only">{t("admin.customers.search")}</label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input id="cq" type="search" placeholder={t("admin.customers.search")} value={q} onChange={(e) => setQ(e.target.value)} className={`${field} w-full pl-9`} />
      </div>
      <p role="status" className="text-label font-normal text-ink-soft">{t("admin.customers.count", { count: shown.length })}</p>
      {shown.length === 0 ? <div className="rounded-card border border-line bg-surface"><EmptyState icon={<UserRound aria-hidden />} title={t("admin.customers.emptyTitle")} description={t("admin.customers.emptyText")} /></div> : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {shown.map((c) => (
            <li key={c.key}>
              <Link href={`/admin/customers/${c.key}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-sand-50">
                <div className="min-w-0 flex-1 basis-48"><p className="text-label font-semibold">{c.name}</p><p className="text-caption text-ink-soft">{c.dialCode} {c.phone}{c.email ? ` · ${c.email}` : ""}</p></div>
                <Badge tone={c.hasAccount ? "brand" : "neutral"}>{c.hasAccount ? t("admin.customers.withEmail") : t("admin.detail.labels.guest")}</Badge>
                <p className="text-caption w-36 text-ink-soft">{t("admin.customers.reservations", { count: c.reservations.length })}<br />{fmt.date(c.lastAt, "short")}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CustomerDetail({ keyParam }: { keyParam: string }) {
  const t = useT();
  const fmt = useFormat();
  const ready = useIsClient();
  const reservations = useReservations();
  const customer: CustomerSummary | undefined = useMemo(() => groupCustomers(reservations).find((c) => c.key === keyParam), [reservations, keyParam]);
  if (!ready) return <Skeleton className="h-72 w-full" />;
  if (!customer) return <EmptyState title={t("admin.customers.notFoundTitle")} description={t("admin.customers.notFoundText")}><Link href="/admin/customers" className="font-semibold text-brand-700 underline">{t("admin.customers.back")}</Link></EmptyState>;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/customers" className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">← {t("admin.customers.back")}</Link>
        <h1 className="text-h1 mt-2">{customer.name}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section aria-labelledby="cc-t" className="h-fit rounded-card border border-line bg-surface p-5">
          <h2 id="cc-t" className="text-h3 mb-3">{t("admin.customers.contact")}</h2>
          <dl className="text-label space-y-2 font-normal">
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">{t("admin.detail.labels.phone")}</dt><dd><a className="hover:underline" href={`tel:${customer.dialCode}${customer.phone.replace(/\s/g, "")}`}>{customer.dialCode} {customer.phone}</a></dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">{t("admin.detail.labels.email")}</dt><dd>{customer.email ?? "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">{t("admin.detail.labels.account")}</dt><dd>{customer.hasAccount ? t("admin.detail.labels.accountLinked") : t("admin.detail.labels.guest")}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="ch-t" className="rounded-card border border-line bg-surface">
          <h2 id="ch-t" className="text-h3 border-b border-line px-5 py-4">{t("admin.customers.history")} ({customer.reservations.length})</h2>
          <ul className="divide-y divide-line">
            {customer.reservations.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/reservations/${r.reference}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-sand-50">
                  <div className="min-w-0 flex-1 basis-40"><p className="text-label font-semibold" translate="no">{r.reference}</p><p className="text-caption text-ink-soft">{fmt.dateTime(r.createdAt)} · {t("admin.list.itemsCount", { count: reservationItemCount(r) })}</p></div>
                  <PaymentStatusBadge status={r.payment.status} /><ReservationStatusBadge status={r.status} />
                  <p className="text-label w-32 text-right"><MoneyTotals totals={r.totals} /></p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
