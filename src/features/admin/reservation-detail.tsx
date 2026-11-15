"use client";

import { Ban, CheckCircle2, ClipboardCheck, Hourglass, MessageSquare, MapPinPen, PackageCheck, Wallet, XCircle, StickyNote } from "lucide-react";
import Image from "@/components/ui/smart-image";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyRows, MoneyText } from "@/components/ui/price";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { PaymentStatusBadge, PickupInfo, ReservationStatusBadge, SectionCard, Timeline, useAdminTimeline } from "@/features/reservations/shared";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLocale, useT } from "@/i18n/provider";
import { hasVariantsRecord } from "@/lib/catalog/model";
import { stockOf, stockState } from "@/lib/catalog/stock";
import { useCatalogState } from "@/lib/stores/catalog-store";
import type { ReservationLine } from "@/lib/reservations/types";
import { formatMoney } from "@/lib/money";
import { sameAddress } from "@/lib/pickup/types";
import { customerFullName, reservationItemCount, reservationLineTotal } from "@/lib/reservations/types";
import { allowedStaffActions, balances, isOverdue, type ActionType } from "@/lib/reservations/workflow";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { usePickup } from "@/lib/stores/pickup-store";
import { useReservations } from "@/lib/stores/reservation-store";
import { type DialogKind, ReservationActionDialog } from "./reservation-actions";

const row = "flex justify-between gap-4 py-1.5";

export function ReservationDetail({ reference }: { reference: string }) {
  const t = useT();
  const locale = useLocale();
  const fmt = useFormat();
  const ready = useIsClient();
  const reservations = useReservations();
  const { settings } = usePickup();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const reservation = reservations.find((r) => r.reference === reference.toUpperCase());
  const timeline = useAdminTimeline(reservation?.events ?? []);

  if (!ready) return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-8 w-64" /><Skeleton className="mt-6 h-72 w-full" /></div>;
  if (!reservation) {
    return (
      <EmptyState icon={<XCircle aria-hidden />} title={t("admin.detail.notFoundTitle")} description={t("admin.detail.notFoundText")}>
        <Link href="/admin/reservations" className="font-semibold text-brand-700 underline">{t("admin.detail.back")}</Link>
      </EmptyState>
    );
  }

  const r = reservation;
  const allowed = new Set<ActionType>(allowedStaffActions(r));
  const differs = !sameAddress(r.pickup.location, settings.location);
  const bal = balances(r);
  const overdue = isOverdue(r, new Date().toISOString());
  const customerNotes = r.events.filter((e) => e.customerNote);
  const internalNotes = r.events.filter((e) => e.internalNote);
  const accountLinked = false;
  void accountLinked;

  const action = (kind: DialogKind, label: string, icon: React.ReactNode, variant: "primary" | "outline" | "danger" | "secondary" = "outline", disabledReason?: string) => (
    <div key={kind}>
      <Button variant={variant} full onClick={() => setDialog(kind)} disabled={!!disabledReason} className="justify-start">{icon}{label}</Button>
      {disabledReason && <p className="text-caption mt-1 text-ink-muted">{disabledReason}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/reservations" className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">← {t("admin.detail.back")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-h1" translate="no">{t("admin.detail.title", { reference: r.reference })}</h1>
          <ReservationStatusBadge status={r.status} />
          <PaymentStatusBadge status={r.payment.status} />
          {r.isSample && <Badge>{t("common.sample")}</Badge>}
        </div>
        <p className="text-label mt-1 font-normal text-ink-soft">{t("admin.detail.labels.submitted")} {fmt.dateTime(r.createdAt)} · {customerFullName(r.customer)}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <SectionCard title={t("admin.detail.sections.products")}>
            <ul className="divide-y divide-line">
              {r.lines.map((l, i) => (
                <li key={`${l.productId}-${i}`} className="flex gap-3 py-3 first:pt-0">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-control bg-sand-100"><Image src={l.image.src} alt={l.image.alt} fill sizes="56px" className="object-cover" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-label font-semibold">{l.name}</p>
                    {l.variantLabel && <p className="text-caption text-ink-soft">{l.variantLabel}</p>}
                    <p className="text-caption mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-soft">
                      <span>{t("admin.detail.labels.availability")} :</span>
                      <LineStock line={l} />
                    </p>
                  </div>
                  <div className="text-label shrink-0 text-right font-normal">
                    <p className="text-ink-soft"><span className="sr-only">{t("admin.detail.labels.qty")} </span>{l.quantity} × <MoneyText value={l.unitPrice} /></p>
                    <p className="font-semibold"><span className="sr-only">{t("admin.detail.labels.line")} </span><MoneyText value={reservationLineTotal(l)} /></p>
                  </div>
                </li>
              ))}
            </ul>
            <MoneyRows label={t("admin.detail.labels.total")} totals={r.totals} className="text-label mt-3 border-t border-line pt-3" valueClassName="text-h3" />
          </SectionCard>

          <SectionCard title={t("admin.detail.sections.history")}>
            <Timeline entries={timeline} label={t("admin.detail.sections.history")} internalLabel={t("admin.detail.notes.internal")} storeMessageLabel={t("admin.detail.notes.customerVisible")} />
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          <SectionCard title={t("admin.detail.sections.actions")}>
            <div className="space-y-2.5">
              {allowed.has("accept") && action("accept", t("admin.detail.actions.accept"), <CheckCircle2 aria-hidden className="size-4" />, "primary")}
              {allowed.has("reject") && action("reject", t("admin.detail.actions.reject"), <XCircle aria-hidden className="size-4" />, "danger")}
              {allowed.has("markReady") && action("ready", t("admin.detail.actions.ready"), <PackageCheck aria-hidden className="size-4" />, "primary")}
              {allowed.has("recordPayment") && action("payment", t("admin.detail.actions.recordPayment"), <Wallet aria-hidden className="size-4" />, "secondary")}
              {allowed.has("collect") && action("collect", t("admin.detail.actions.collect"), <ClipboardCheck aria-hidden className="size-4" />, "primary", r.payment.status !== "paid" ? t("admin.detail.actions.collectBlocked") : undefined)}
              {allowed.has("expire") && action("expire", t("admin.detail.actions.expire"), <Hourglass aria-hidden className="size-4" />)}
              {allowed.has("cancel") && action("cancel", t("admin.detail.actions.cancel"), <Ban aria-hidden className="size-4" />, "danger")}
              {allowed.size <= 1 && <p className="text-label font-normal text-ink-soft">{t("admin.detail.actions.none")}</p>}
            </div>
            {overdue && <p className="text-caption mt-3 font-medium text-warning-fg">{t("admin.dashboard.overdue", { count: 1 })}</p>}
          </SectionCard>

          <SectionCard title={t("admin.detail.sections.customer")}>
            <dl className="text-label font-normal">
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.name")}</dt><dd>{customerFullName(r.customer)}</dd></div>
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.phone")}</dt><dd><a href={`tel:${r.customer.dialCode}${r.customer.phone.replace(/\s/g, "")}`} className="hover:underline">{r.customer.dialCode} {r.customer.phone}</a></dd></div>
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.email")}</dt><dd>{r.customer.email ?? "—"}</dd></div>
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.account")}</dt><dd>{r.customer.email ? t("admin.detail.labels.accountLinked") : t("admin.detail.labels.guest")}</dd></div>
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.language")}</dt><dd lang={r.locale}>{t(`admin.detail.dialogs.languageName.${r.locale}`)}</dd></div>
            </dl>
          </SectionCard>

          <SectionCard title={t("admin.detail.sections.payment")}>
            <dl className="text-label font-normal">
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.method")}</dt><dd>{t("paymentMethod.cash_at_pickup")}</dd></div>
              <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.paymentStatus")}</dt><dd><PaymentStatusBadge status={r.payment.status} /></dd></div>
              {bal.map((b) => (
                <Fragment key={b.currency}>
                  <div className={row}><dt className="text-ink-soft">{bal.length > 1 ? `${t("admin.detail.labels.paid")} · ${b.currency}` : t("admin.detail.labels.paid")}</dt><dd>{formatMoney({ amount: b.paid, currency: b.currency }, locale)}</dd></div>
                  <div className={row}><dt className="text-ink-soft">{bal.length > 1 ? `${t("admin.detail.labels.due")} · ${b.currency}` : t("admin.detail.labels.due")}</dt><dd className="font-semibold">{formatMoney({ amount: b.due, currency: b.currency }, locale)}</dd></div>
                </Fragment>
              ))}
              {r.status === "ready_for_pickup" && <div className={row}><dt className="text-ink-soft">{t("admin.detail.labels.expires")}</dt><dd>{r.expiresAt ? fmt.date(r.expiresAt) : <span className="text-ink-muted">{t("admin.detail.labels.noExpiry")}</span>}</dd></div>}
            </dl>
            {r.payment.records.length > 0 && (
              <ul className="text-caption mt-3 space-y-1.5 border-t border-line pt-3 text-ink-soft">
                {r.payment.records.map((p) => <li key={p.id}>{fmt.dateTime(p.receivedAt)} · {formatMoney({ amount: p.amount, currency: p.currency }, locale)} · {p.staff}{p.reference ? ` · ${p.reference}` : ""}</li>)}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={t("admin.detail.snapshot.title")} action={allowed.has("changePickup") ? <Button variant="outline" size="sm" onClick={() => setDialog("pickup")}><MapPinPen aria-hidden className="size-4" />{t("admin.detail.snapshot.change")}</Button> : undefined}>
            <p className="text-caption mb-3 text-ink-soft">{t("admin.detail.snapshot.explain")}</p>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone={differs ? "warning" : "success"}>{differs ? t("admin.detail.snapshot.differs") : t("admin.detail.snapshot.same")}</Badge>
              <Badge>{t(`admin.detail.snapshot.origin.${r.pickup.origin}`)}</Badge>
            </div>
            <PickupInfo location={r.pickup.location} instructions={r.pickup.instructions} status={r.status} localeOverride={r.locale} />
            <p className="text-caption mt-3 text-ink-muted">{t("admin.detail.snapshot.capturedAt", { date: fmt.dateTime(r.pickup.capturedAt) })}</p>
          </SectionCard>

          <SectionCard title={t("admin.detail.sections.notes")}>
            <div className="space-y-4">
              <div>
                <h3 className="text-label flex items-center gap-2 font-semibold text-brand-700"><MessageSquare aria-hidden className="size-4" />{t("admin.detail.notes.customerVisible")}</h3>
                {customerNotes.length === 0 ? <p className="text-caption mt-1 text-ink-muted">{t("admin.detail.notes.none")}</p> : <ul className="mt-2 space-y-2">{customerNotes.map((e) => <li key={e.id} className="text-label rounded-control bg-brand-50 px-3 py-2 font-normal" lang={r.locale}>{e.customerNote}<span className="text-caption block text-ink-muted">{fmt.dateTime(e.at)}</span></li>)}</ul>}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setDialog("note-customer")}>{t("admin.detail.notes.addCustomer")}</Button>
              </div>
              <div className="border-t border-line pt-4">
                <h3 className="text-label flex items-center gap-2 font-semibold"><StickyNote aria-hidden className="size-4" />{t("admin.detail.notes.internal")}</h3>
                {internalNotes.length === 0 ? <p className="text-caption mt-1 text-ink-muted">{t("admin.detail.notes.none")}</p> : <ul className="mt-2 space-y-2">{internalNotes.map((e) => <li key={e.id} className="text-label rounded-control border border-dashed border-line-strong bg-sand-50 px-3 py-2 font-normal">{e.internalNote}<span className="text-caption block text-ink-muted">{fmt.dateTime(e.at)}{e.actor.kind === "staff" ? ` · ${e.actor.name}` : ""}</span></li>)}</ul>}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setDialog("note-internal")}>{t("admin.detail.notes.addInternal")}</Button>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <ReservationActionDialog reservation={r} kind={dialog} onClose={() => setDialog(null)} />
      <span className="sr-only">{reservationItemCount(r)}</span>
    </div>
  );
}

/** Live stock for one reservation line: physical, reserved (all open reservations) and what is still available. */
function LineStock({ line }: { line: ReservationLine }) {
  const t = useT();
  const catalog = useCatalogState();
  const reservations = useReservations();
  const rec = catalog.products.find((p) => p.id === line.productId);
  if (!rec) return <Badge>{t("admin.detail.labels.unknownProduct")}</Badge>;
  const info = stockOf(rec, reservations, hasVariantsRecord(rec) ? line.variantId : undefined);
  const state = stockState(rec, info);
  if (state === "untracked") return <Badge>{t("admin.inventory.states.untracked")}</Badge>;
  return (
    <>
      <Badge tone={state === "ok" ? "success" : state === "low" ? "warning" : "danger"}>{t(`admin.inventory.states.${state}`)}</Badge>
      <span>{t("admin.detail.stockLine", { available: info.available, onHand: info.onHand, reserved: info.reserved })}</span>
    </>
  );
}
