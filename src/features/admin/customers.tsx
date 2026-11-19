"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ActionError, AdminErrorState } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { PaymentStatusBadge, ReservationStatusBadge, SectionCard } from "@/features/reservations/shared";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import type { AdminCustomer } from "@/lib/api/admin/dto";
import { getCustomer, listCustomers, listReservations, updateCustomer } from "@/lib/api/admin/endpoints";
import { useAction, useAdminResource } from "@/lib/api/admin/hooks";
import { problemOf } from "@/lib/api/errors";
import { attemptKey, endAttempt } from "@/lib/api/idempotency";
import { isTransientError } from "@/lib/api/errors";
import { fieldErrorKey, fieldProblems } from "@/lib/api/errors";
import { useAdminSession } from "./admin-identity";
import { CurrencyFigures, RefreshButton, useMoneyText, useUrlState } from "./common";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";
const lower = <T extends string>(s: T) => s.toLowerCase() as Lowercase<T>;

/** Customers as the server holds them: registered accounts and guests are SEPARATE records and are never merged, even with the same phone or e-mail. */
export function CustomerList() {
  const t = useT();
  const fmt = useFormat();
  const url = useUrlState("/admin/customers");
  const q = url.get("q"), kind = url.get("kind"), from = url.get("from"), to = url.get("to"), sort = url.get("sort");
  const page = Math.max(0, Number(url.get("page")) || 0);
  const res = useAdminResource(`customers:${q}:${kind}:${from}:${to}:${sort}:${page}`, (signal) => listCustomers({ q: q || undefined, kind: kind || undefined, from: from || undefined, to: to || undefined, sort: sort || undefined, page, size: 20 }, { signal }));
  const hasFilters = !!(q || kind || from || to);
  return (
    <div className="space-y-4">
      <p className="text-caption text-ink-soft">{t("adminCust.note")}</p>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,1fr)]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="cq" className="sr-only">{t("admin.customers.search")}</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="cq" type="search" defaultValue={q} key={q} placeholder={t("admin.customers.search")} onKeyDown={(e) => { if (e.key === "Enter") url.set({ q: (e.target as HTMLInputElement).value || undefined }); }} onBlur={(e) => { if (e.target.value !== q) url.set({ q: e.target.value || undefined }); }} className={`${field} w-full pl-9`} />
        </div>
        <div><label htmlFor="ck" className="text-caption mb-1 block text-ink-muted">{t("adminCust.kind")}</label><select id="ck" value={kind} onChange={(e) => url.set({ kind: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("admin.list.allStatuses")}</option><option value="REGISTERED">{t("adminCust.kinds.REGISTERED")}</option><option value="GUEST">{t("adminCust.kinds.GUEST")}</option></select></div>
        <div><label htmlFor="cf" className="text-caption mb-1 block text-ink-muted">{t("admin.list.from")}</label><input id="cf" type="date" value={from} onChange={(e) => url.set({ from: e.target.value || undefined })} className={`${field} w-full`} /></div>
        <div><label htmlFor="ct" className="text-caption mb-1 block text-ink-muted">{t("admin.list.to")}</label><input id="ct" type="date" value={to} onChange={(e) => url.set({ to: e.target.value || undefined })} className={`${field} w-full`} /></div>
        <div><label htmlFor="cs" className="text-caption mb-1 block text-ink-muted">{t("admin.list.sort")}</label><select id="cs" value={sort} onChange={(e) => url.set({ sort: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("admin.list.sortOptions.newest")}</option><option value="NAME">{t("adminProd.sort.NAME")}</option></select></div>
      </form>
      {res.error != null && !res.data ? <AdminErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <div role="status" aria-label={t("adminCommon.loading")}><Skeleton className="h-64 w-full" /></div> : (
        <>
          <p role="status" className="text-label font-normal text-ink-soft">{t("admin.customers.count", { count: res.data.totalItems })}{hasFilters && <Button variant="ghost" size="sm" className="ml-2" onClick={url.clear}>{t("adminCommon.clearFilters")}</Button>}<span className="ml-2"><RefreshButton onClick={res.reload} loading={res.loading} /></span></p>
          {res.data.items.length === 0 ? (
            <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Search aria-hidden />} title={t("admin.customers.emptyTitle")} description={hasFilters ? t("adminCommon.emptyFiltered") : t("admin.customers.emptyText")} /></div>
          ) : (
            <div tabIndex={0} className="overflow-x-auto rounded-card border border-line bg-surface" aria-busy={res.loading}>
              <table className="w-full min-w-[44rem] text-left">
                <caption className="sr-only">{t("admin.customers.title")}</caption>
                <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted"><tr><th scope="col" className="px-3 py-3 font-medium">{t("admin.detail.labels.name")}</th><th scope="col" className="px-3 py-3 font-medium">{t("admin.detail.sections.customer")}</th><th scope="col" className="px-3 py-3 font-medium">{t("adminCust.kind")}</th><th scope="col" className="px-3 py-3 text-right font-medium">{t("admin.list.columns.items")}</th><th scope="col" className="px-3 py-3 font-medium">{t("adminCust.last")}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {res.data.items.map((c) => (
                    <tr key={c.id} className="text-label align-top font-normal hover:bg-sand-50">
                      <th scope="row" className="px-3 py-3 text-left font-semibold"><Link href={`/admin/customers/${c.id}`} className="hover:underline">{c.firstName} {c.lastName}</Link></th>
                      <td className="px-3 py-3 text-ink-soft"><p>{c.dialCode} {c.phone}</p><p className="text-caption">{c.email ?? "—"}</p></td>
                      <td className="px-3 py-3"><Badge tone={c.kind === "REGISTERED" ? "brand" : "neutral"}>{t(`adminCust.kinds.${c.kind}`)}</Badge></td>
                      <td className="px-3 py-3 text-right tabular-nums">{c.activity.reservations}</td>
                      <td className="px-3 py-3 text-ink-soft">{c.activity.lastReservationAt ? fmt.date(c.activity.lastReservationAt) : "—"}</td>
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

export function CustomerDetail({ keyParam }: { keyParam: string }) {
  const t = useT();
  const res = useAdminResource(`customer:${keyParam}`, (signal) => getCustomer(keyParam, { signal }));
  if (res.error != null && !res.data) {
    return problemOf(res.error)?.status === 404
      ? <EmptyState title={t("admin.customers.notFoundTitle")} description={t("adminCust.notFoundText")}><Link href="/admin/customers" className="font-semibold text-brand-700 underline">{t("admin.customers.back")}</Link></EmptyState>
      : <AdminErrorState error={res.error} onRetry={res.reload} />;
  }
  if (!res.data) return <Skeleton className="h-96 w-full" />;
  // key = id + version: after a save or a conflict reload the form is rebuilt from the server's data
  return <CustomerView key={`${res.data.id}:${res.data.version}`} c={res.data} reload={res.reload} />;
}

function CustomerView({ c, reload }: { c: AdminCustomer; reload: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const money = useMoneyText();
  const toast = useToast();
  const save = useAction();
  const canEdit = useAdminSession().can("CUSTOMERS_EDIT");
  const [first, setFirst] = useState(c.firstName);
  const [last, setLast] = useState(c.lastName);
  const [email, setEmail] = useState(c.email ?? "");
  const [page, setPage] = useState(0);
  const guest = c.kind === "GUEST";
  const dirty = first !== c.firstName || last !== c.lastName || email !== (c.email ?? "");
  const problems = fieldProblems(save.error);
  const fe = (f: string) => (problems[f] ? t(fieldErrorKey(problems[f])) : undefined);
  const reservations = useAdminResource(`customer-reservations:${c.id}:${page}`, (signal) => listReservations({ customerId: c.id, size: 10, page }, { signal }));

  const submit = async () => {
    const body = { version: c.version, firstName: first.trim(), lastName: last.trim(), email: email.trim() || undefined };
    const scope = `customer:${c.id}`;
    const r = await save.run(() => updateCustomer(c.id, body, { idempotencyKey: attemptKey(scope, body) }));
    if (!r.ok) { if (!isTransientError(r.error)) endAttempt(scope); return; }
    endAttempt(scope);
    toast.show({ tone: "success", message: t("adminCust.saved") });
    reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/customers" className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">← {t("admin.customers.back")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-h1">{c.firstName} {c.lastName}</h1><Badge tone={c.kind === "REGISTERED" ? "brand" : "neutral"}>{t(`adminCust.kinds.${c.kind}`)}</Badge></div>
        <p className="text-caption mt-1 text-ink-soft">{t("adminCust.since", { date: fmt.date(c.createdAt) })}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard title={t("admin.customers.contact")}>
          <dl className="text-label mb-4 font-normal"><div className="flex justify-between gap-4 py-1"><dt className="text-ink-soft">{t("admin.detail.labels.phone")}</dt><dd>{c.dialCode} {c.phone}</dd></div></dl>
          {guest && canEdit ? (
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4" noValidate>
              <p className="text-caption text-ink-soft">{t("adminCust.guestEdit")}</p>
              <div className="grid gap-4 sm:grid-cols-2"><TextField label={t("account.profile.firstName")} value={first} onChange={(e) => setFirst(e.target.value)} error={fe("firstName")} /><TextField label={t("account.profile.lastName")} value={last} onChange={(e) => setLast(e.target.value)} error={fe("lastName")} /></div>
              <TextField label={t("account.profile.email")} type="email" optional value={email} onChange={(e) => setEmail(e.target.value)} error={fe("email")} />
              {save.error != null && <ActionError error={save.error} onReload={reload} />}
              <Button type="submit" loading={save.pending} disabled={!dirty}>{t("common.save")}</Button>
            </form>
          ) : (
            <><p className="text-label font-normal">{c.email ?? "—"}</p><Alert tone="info" className="mt-3">{t(guest ? "adminRole.readOnlyCustomer" : "adminCust.registeredReadOnly")}</Alert></>
          )}
        </SectionCard>

        <SectionCard title={t("adminCust.summary")}>
          {c.summary ? (
            <div className="space-y-4">
              <div><p className="text-label font-semibold">{t("adminCust.collected")}</p><p className="text-caption text-ink-muted">{t("adminCust.collectedNote")}</p><CurrencyFigures values={c.summary.collectedByCurrency} /></div>
              <div><p className="text-label font-semibold">{t("adminCust.openDue")}</p><CurrencyFigures values={c.summary.openDueByCurrency} /></div>
              <div><p className="text-label font-semibold">{t("adminDash.byStatus")}</p>
                <dl className="mt-1 space-y-0.5">{Object.entries(c.summary.reservationsByStatus).filter(([, n]) => n > 0).map(([s, n]) => <div key={s} className="flex justify-between"><dt className="text-label font-normal text-ink-soft">{t(`status.${lower(s) as "confirmed"}`)}</dt><dd className="tabular-nums">{n}</dd></div>)}</dl></div>
            </div>
          ) : <p className="text-label font-normal text-ink-soft">—</p>}
        </SectionCard>
      </div>

      <SectionCard title={t("admin.customers.history")}>
        {reservations.error != null && !reservations.data ? <AdminErrorState error={reservations.error} onRetry={reservations.reload} /> : !reservations.data ? <Skeleton className="h-24 w-full" /> : reservations.data.items.length === 0 ? <p className="text-label font-normal text-ink-soft">{t("adminCust.noReservations")}</p> : (
          <>
            <ul className="divide-y divide-line">
              {reservations.data.items.map((r) => (
                <li key={r.id}><Link href={`/admin/reservations/${r.reference}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-sand-50">
                  <div className="min-w-0 flex-1"><p className="text-label font-semibold" translate="no">{r.reference}</p><p className="text-caption text-ink-soft">{fmt.dateTime(r.createdAt)} · {r.balances.map((b) => money(b.total, b.currency)).join(" · ")}</p></div>
                  <PaymentStatusBadge status={lower(r.paymentStatus)} /><ReservationStatusBadge status={lower(r.status)} />
                </Link></li>
              ))}
            </ul>
            {reservations.data.totalPages > 1 && <div className="mt-3 flex items-center justify-between"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("adminCommon.previous")}</Button><span className="text-caption text-ink-soft">{t("adminCommon.page", { page: page + 1, count: reservations.data.totalPages })}</span><Button variant="outline" size="sm" disabled={page + 1 >= reservations.data.totalPages} onClick={() => setPage((p) => p + 1)}>{t("adminCommon.next")}</Button></div>}
          </>
        )}
      </SectionCard>
    </div>
  );
}
