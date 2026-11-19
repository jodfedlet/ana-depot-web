"use client";

import { Ban, CheckCircle2, ClipboardCheck, MessageSquare, PackageCheck, StickyNote, XCircle } from "lucide-react";
import { useState } from "react";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { ReservationMessages } from "./notifications";
import { PaymentStatusBadge, PickupInfo, ReservationStatusBadge, SectionCard } from "@/features/reservations/shared";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import type { Locale } from "@/i18n/config";
import type { AdminReservation } from "@/lib/api/admin/dto";
import { useAdminReservation } from "@/lib/api/admin/reservation-hooks";
import { toPickupInstructions, toPickupLocation } from "@/lib/api/map-reservation";
import type { PickupInstructionsDto, PickupLocationDto } from "@/lib/api/dto";
import { problemOf } from "@/lib/api/errors";
import { useMoneyText } from "./common";
import { PaymentPanel } from "./payment-panel";
import { type DialogKind, ReservationActionDialog } from "./reservation-actions";

const row = "flex justify-between gap-4 py-1.5";
const lower = <T extends string>(s: T) => s.toLowerCase() as Lowercase<T>;

export function ReservationDetail({ reference }: { reference: string }) {
  const t = useT();
  const res = useAdminReservation(reference);
  if (res.error != null && !res.data) {
    return problemOf(res.error)?.status === 404
      ? <EmptyState icon={<XCircle aria-hidden />} title={t("admin.detail.notFoundTitle")} description={t("adminRes.notFoundText")}><Link href="/admin/reservations" className="font-semibold text-brand-700 underline">{t("admin.detail.back")}</Link></EmptyState>
      : <AdminErrorState error={res.error} onRetry={res.reload} />;
  }
  if (!res.data) return <div role="status" aria-label={t("adminCommon.loading")}><Skeleton className="h-8 w-64" /><Skeleton className="mt-6 h-72 w-full" /></div>;
  return <Detail r={res.data} reload={res.reload} loading={res.loading} />;
}

function Detail({ r, reload, loading }: { r: AdminReservation; reload: () => void; loading: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const money = useMoneyText();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const allowed = new Set(r.allowedActions);
  const customerNotes = r.notes.filter((n) => n.visibility === "CUSTOMER_VISIBLE");
  const internalNotes = r.notes.filter((n) => n.visibility === "INTERNAL");
  const pickup = r.pickup as { location?: PickupLocationDto | null; instructions?: PickupInstructionsDto | null; capturedAt?: string; origin?: string } | null;
  const action = (kind: DialogKind, label: string, icon: React.ReactNode, variant: "primary" | "outline" | "danger" | "secondary" = "outline") => (
    <Button key={kind} variant={variant} full onClick={() => setDialog(kind)} className="justify-start">{icon}{label}</Button>
  );
  const terminal = !allowed.has("ACCEPT") && !allowed.has("REJECT") && !allowed.has("MARK_READY") && !allowed.has("COLLECT") && !allowed.has("CANCEL");

  return (
    <div className="space-y-6" aria-busy={loading}>
      <div>
        <Link href="/admin/reservations" className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">← {t("admin.detail.back")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-h1" translate="no">{t("admin.detail.title", { reference: r.reference })}</h1>
          <ReservationStatusBadge status={lower(r.status)} />
          <PaymentStatusBadge status={lower(r.paymentStatus)} />
        </div>
        <p className="text-label mt-1 font-normal text-ink-soft">{t("admin.detail.labels.submitted")} {fmt.dateTime(r.createdAt)} · {r.contact.firstName} {r.contact.lastName}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <SectionCard title={t("admin.detail.sections.products")}>
            <p className="text-caption mb-3 text-ink-muted">{t("adminRes.snapshotNote")}</p>
            <ul className="divide-y divide-line">
              {r.lines.map((l) => (
                <li key={l.id} className="flex gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/products/${l.productId}`} className="text-label font-semibold hover:underline">{l.name}</Link>
                    <p className="text-caption text-ink-soft">{l.sku}{l.variantLabel ? ` · ${l.variantLabel}` : ""}</p>
                    <p className="text-caption mt-1 text-ink-soft">{t(`adminRes.priceKind.${l.pricingKind as "RETAIL"}`, { qty: l.tierMinQuantity ?? 0 })}</p>
                  </div>
                  <div className="text-label shrink-0 text-right font-normal">
                    <p className="text-ink-soft"><span className="sr-only">{t("admin.detail.labels.qty")} </span>{l.quantity} × {money(l.unitPrice, l.currency)}</p>
                    <p className="font-semibold"><span className="sr-only">{t("admin.detail.labels.line")} </span>{money(l.lineTotal, l.currency)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3">{r.balances.map((b) => <div key={b.currency} className="flex justify-between"><dt className="text-label font-normal text-ink-soft">{t("admin.detail.labels.total")} · {b.currency}</dt><dd className="text-h3">{money(b.total, b.currency)}</dd></div>)}</dl>
          </SectionCard>

          <SectionCard title={t("admin.detail.sections.history")}>
            <ol className="space-y-3">
              {[...r.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="border-l-2 border-line pl-3">
                  <p className="text-label font-semibold">{h.from ? `${t(`status.${lower(h.from)}`)} → ` : ""}{t(`status.${lower(h.to)}`)}</p>
                  <p className="text-caption text-ink-muted">{fmt.dateTime(h.at)} · {t(`adminRes.actor.${h.actor.kind as "STAFF"}`)}{h.actor.userId ? ` · ${h.actor.userId.slice(0, 8)}` : ""}</p>
                  {(h.reasonCode || h.reasonNote) && <p className="text-caption mt-1 text-ink-soft">{h.reasonCode ? t(`rejectReasons.${lower(h.reasonCode) as "other"}`) : ""}{h.reasonNote ? ` — ${h.reasonNote}` : ""}</p>}
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard title={t("admin.detail.sections.actions")}>
            <div className="space-y-2.5">
              {allowed.has("ACCEPT") && action("accept", t("admin.detail.actions.accept"), <CheckCircle2 aria-hidden className="size-4" />, "primary")}
              {allowed.has("REJECT") && action("reject", t("admin.detail.actions.reject"), <XCircle aria-hidden className="size-4" />, "danger")}
              {allowed.has("MARK_READY") && action("ready", t("admin.detail.actions.ready"), <PackageCheck aria-hidden className="size-4" />, "primary")}
              {allowed.has("COLLECT") && action("collect", t("admin.detail.actions.collect"), <ClipboardCheck aria-hidden className="size-4" />, "primary")}
              {r.status === "READY_FOR_PICKUP" && !allowed.has("COLLECT") && <p className="text-caption text-ink-muted">{t("admin.detail.actions.collectBlocked")}</p>}
              {allowed.has("CANCEL") && action("cancel", t("admin.detail.actions.cancel"), <Ban aria-hidden className="size-4" />, "danger")}
              {terminal && <p className="text-label font-normal text-ink-soft">{t("admin.detail.actions.none")}</p>}
            </div>
            <p className="text-caption mt-3 text-ink-muted">{t("adminRes.actionsNote")}</p>
          </SectionCard>

          <SectionCard title={t("admin.detail.sections.customer")}>
            <dl className="text-label font-normal">
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.name")}</dt><dd>{r.contact.firstName} {r.contact.lastName}</dd></div>
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.phone")}</dt><dd><a href={`tel:${r.contact.dialCode}${r.contact.phone.replace(/\s/g, "")}`} className="hover:underline">{r.contact.dialCode} {r.contact.phone}</a></dd></div>
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.email")}</dt><dd>{r.contact.email ?? "—"}</dd></div>
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.account")}</dt><dd>{r.customerId ? <Link href={`/admin/customers/${r.customerId}`} className="font-semibold text-brand-700 underline">{t("adminRes.customerRecord")}</Link> : "—"}</dd></div>
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.language")}</dt><dd lang={r.locale}>{t(`admin.detail.dialogs.languageName.${r.locale === "ht" ? "ht" : "fr"}`)}</dd></div>
              {r.status === "READY_FOR_PICKUP" && <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.expires")}</dt><dd>{r.expiresAt ? fmt.date(r.expiresAt) : <span className="text-ink-muted">{t("admin.detail.labels.noExpiry")}</span>}</dd></div>}
            </dl>
            <p className="text-caption mt-3 text-ink-muted">{r.terms ? t("adminRes.terms", { version: r.terms.version ?? t("adminCommon.none"), date: fmt.dateTime(r.terms.acceptedAt) }) : t("adminRes.termsNone")}</p>
          </SectionCard>

          <SectionCard title={t("admin.detail.sections.payment")}>
            <PaymentPanel reservation={r} onChanged={reload} />
          </SectionCard>

          <SectionCard title={t("adminNotif.onReservation")}>
            <ReservationMessages reservationId={r.id} />
          </SectionCard>

          <SectionCard title={t("admin.detail.snapshot.title")}>
            <p className="text-caption mb-3 text-ink-soft">{t("adminRes.pickupSnapshotNote")}</p>
            {pickup?.location?.storeName ? (
              <PickupInfo location={toPickupLocation(pickup.location)} instructions={toPickupInstructions(pickup.instructions)} status={lower(r.status)} localeOverride={(r.locale === "ht" ? "ht" : "fr") as Locale} />
            ) : <p className="text-label font-normal text-ink-soft">{t("pickup.snapshotMissing")}</p>}
            {pickup?.capturedAt && <p className="text-caption mt-3 text-ink-muted">{t("admin.detail.snapshot.capturedAt", { date: fmt.dateTime(pickup.capturedAt) })}</p>}
          </SectionCard>

          <SectionCard title={t("admin.detail.sections.notes")}>
            <div className="space-y-4">
              <div>
                <h3 className="text-label flex items-center gap-2 font-semibold text-brand-700"><MessageSquare aria-hidden className="size-4" />{t("admin.detail.notes.customerVisible")}</h3>
                {customerNotes.length === 0 ? <p className="text-caption mt-1 text-ink-muted">{t("admin.detail.notes.none")}</p> : <ul className="mt-2 space-y-2">{customerNotes.map((n) => <li key={n.id} className="text-label rounded-control border-l-2 border-brand-600 bg-brand-50 px-3 py-2 font-normal"><span className="block whitespace-pre-line">{n.body}</span><span className="text-caption text-ink-muted">{fmt.dateTime(n.at)}</span></li>)}</ul>}
                {allowed.has("ADD_NOTE") && <Button variant="outline" size="sm" className="mt-2" onClick={() => setDialog("note-customer")}>{t("admin.detail.notes.addCustomer")}</Button>}
              </div>
              <div className="border-t border-line pt-4">
                <h3 className="text-label flex items-center gap-2 font-semibold"><StickyNote aria-hidden className="size-4" />{t("admin.detail.notes.internal")} <Badge tone="neutral">{t("adminRes.staffOnly")}</Badge></h3>
                {internalNotes.length === 0 ? <p className="text-caption mt-1 text-ink-muted">{t("admin.detail.notes.none")}</p> : <ul className="mt-2 space-y-2">{internalNotes.map((n) => <li key={n.id} className="text-label rounded-control border border-dashed border-line-strong bg-sand-50 px-3 py-2 font-normal"><span className="block whitespace-pre-line">{n.body}</span><span className="text-caption text-ink-muted">{fmt.dateTime(n.at)}</span></li>)}</ul>}
                {allowed.has("ADD_NOTE") && <Button variant="outline" size="sm" className="mt-2" onClick={() => setDialog("note-internal")}>{t("admin.detail.notes.addInternal")}</Button>}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {dialog && <ReservationActionDialog reservation={r} kind={dialog} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} />}
    </div>
  );
}
