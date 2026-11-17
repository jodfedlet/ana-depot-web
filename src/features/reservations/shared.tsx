"use client";

import { Check, MapPin, Phone, Mail, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { useFormat } from "@/i18n/format";
import { useLocale, useLText, useT } from "@/i18n/provider";
import type { Locale } from "@/i18n/config";
import type { TFunction } from "@/i18n/types";
import { cn } from "@/lib/cn";
import { type LText, isEmptyLText, pick } from "@/lib/localized";
import { formatMoney, type Money } from "@/lib/money";
import type { PickupInstructions, PickupLocation } from "@/lib/pickup/types";
import type { DisplayLine } from "@/components/ui/order-lines";
import type { CustomerEvent, CustomerReservation } from "@/lib/reservations/customer-view";
import type { PaymentStatus, ReservationEvent, ReservationStatus } from "@/lib/reservations/types";

const statusTone: Record<ReservationStatus, Tone> = {
  pending_review: "warning",
  confirmed: "info",
  ready_for_pickup: "success",
  collected: "brand",
  rejected: "danger",
  cancelled: "neutral",
  expired: "neutral",
};
export const reservationStatusTone = statusTone;

export function ReservationStatusBadge({ status, className }: { status: ReservationStatus; className?: string }) {
  const t = useT();
  return <Badge tone={statusTone[status]} className={className}>{t(`status.${status}`)}</Badge>;
}

const payTone: Record<PaymentStatus, Tone> = { unpaid: "neutral", partial: "warning", paid: "success" };
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useT();
  return <Badge tone={payTone[status]}>{t(`paymentStatus.${status}`)}</Badge>;
}

/** Where and when to collect, plus the instructions that apply at the reservation's current stage. */
export function PickupInfo({
  location,
  instructions,
  status,
  localeOverride,
  className,
}: {
  location: PickupLocation;
  instructions: PickupInstructions;
  /** When set, shows the stage-specific message (accepted / ready). Omit while reserving. */
  status?: ReservationStatus;
  /** Admin preview: render the admin-authored texts in another language. */
  localeOverride?: Locale;
  className?: string;
}) {
  const t = useT();
  const uiLocale = useLocale();
  const locale = localeOverride ?? uiLocale;
  const text = (l: LText) => pick(l, locale);
  const stage =
    status === "ready_for_pickup" ? { heading: t("pickup.readyHeading"), body: instructions.ready, tone: "bg-success-bg text-success-fg" }
    : status === "confirmed" ? { heading: t("pickup.acceptedHeading"), body: instructions.accepted, tone: "bg-info-bg text-info-fg" }
    : null;
  const block = (title: string, body: LText) =>
    isEmptyLText(body) || !text(body).trim() ? null : (
      <div>
        <p className="text-label font-semibold">{title}</p>
        <p className="text-label mt-0.5 whitespace-pre-line font-normal text-ink-soft">{text(body)}</p>
      </div>
    );

  return (
    <div className={cn("space-y-4", className)}>
      {stage && !isEmptyLText(stage.body) && (
        <div className={cn("rounded-card p-3.5", stage.tone)}>
          <p className="text-label font-semibold">{stage.heading}</p>
          <p className="text-label mt-1 whitespace-pre-line font-normal">{text(stage.body)}</p>
        </div>
      )}
      <address className="text-label space-y-1.5 font-normal not-italic">
        <p className="font-semibold text-ink">{location.storeName}</p>
        <p className="flex gap-2 text-ink-soft"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{location.addressLine}<br />{[location.city, location.region].filter(Boolean).join(", ")}{location.postalCode ? ` ${location.postalCode}` : ""}<br />{t(`countries.${location.country as "HT"}`)}</span>
        </p>
        {text(location.additionalLocationInfo).trim() && <p className="pl-6 text-caption text-ink-muted">{text(location.additionalLocationInfo)}</p>}
        <p className="flex gap-2 text-ink-soft"><Phone aria-hidden className="mt-0.5 size-4 shrink-0" /><a className="hover:underline" href={`tel:${location.phone.replace(/\s/g, "")}`}>{location.phone}</a></p>
        {location.email && <p className="flex gap-2 text-ink-soft"><Mail aria-hidden className="mt-0.5 size-4 shrink-0" /><a className="hover:underline" href={`mailto:${location.email}`}>{location.email}</a></p>}
      </address>
      <div>
        <p className="text-label mb-1.5 flex items-center gap-2 font-semibold"><Clock aria-hidden className="size-4" />{t("pickup.hours")}</p>
        <dl className="text-label grid grid-cols-[7.5rem_1fr] gap-y-1 font-normal text-ink-soft">
          {location.schedule.map((d) => (
            <div key={d.day} className="contents">
              <dt>{t(`pickup.days.${d.day}`)}</dt>
              <dd className="tabular-nums">{d.open ? `${d.from} – ${d.to}` : t("pickup.closed")}</dd>
            </div>
          ))}
        </dl>
        {text(location.closureInfo).trim() && <p className="text-caption mt-2 font-medium text-warning-fg">{t("pickup.closure")} : {text(location.closureInfo)}</p>}
      </div>
      {block(t("pickup.instructions"), instructions.general)}
      {block(t("pickup.contact"), instructions.contact)}
      {block(t("pickup.policy"), instructions.policy)}
    </div>
  );
}

// ---------- timeline ----------
export interface TimelineEntry {
  id: string;
  at: string;
  title: string;
  /** Visible to the customer. */
  note?: string;
  /** Staff only (admin view). */
  internalNote?: string;
  detail?: string;
  tone: "neutral" | "success" | "danger" | "warning" | "info";
}

function titleFor(t: TFunction, locale: Locale, type: ReservationEvent["type"], opts: { cancelledBy?: "customer" | "store"; amount?: Money }): string {
  switch (type) {
    case "cancelled": return opts.cancelledBy === "customer" ? t("events.cancelledByCustomer") : t("events.cancelledByStore");
    case "payment_recorded": return t("events.payment_recorded", { amount: opts.amount ? formatMoney(opts.amount, locale) : "" });
    default: return t(`events.${type}`);
  }
}
const toneFor = (type: ReservationEvent["type"]): TimelineEntry["tone"] =>
  type === "rejected" || type === "cancelled" ? "danger" : type === "expired" ? "warning" : type === "ready_for_pickup" || type === "collected" || type === "payment_recorded" ? "success" : type === "accepted" ? "info" : "neutral";

/** Events as the CUSTOMER may see them (the API's `CustomerReservationView` never carries internal notes or staff identities). */
export function useCustomerTimeline(events: CustomerEvent[]): TimelineEntry[] {
  const t = useT();
  const locale = useLocale();
  return events.map((e) => ({
    id: e.id,
    at: e.at,
    title: titleFor(t, locale, e.type, { cancelledBy: e.cancelledBy }),
    note: e.note,
    detail: e.rejectReason ? t("events.reason", { reason: t(`rejectReasons.${e.rejectReason}`) }) : undefined,
    tone: toneFor(e.type),
  }));
}

/** Full events for STAFF, including staff names and internal notes. */
export function useAdminTimeline(events: ReservationEvent[]): TimelineEntry[] {
  const t = useT();
  const locale = useLocale();
  return events.map((e) => {
    const parts: string[] = [];
    if (e.actor.kind === "staff") parts.push(t("events.by", { name: e.actor.name }));
    if (e.detail?.rejectReason) parts.push(t("events.reason", { reason: t(`rejectReasons.${e.detail.rejectReason}`) }));
    if (e.detail?.cancelReason) parts.push(t("events.reason", { reason: e.detail.cancelReason }));
    if (e.detail?.fromPickup && e.detail.toPickup) parts.push(`${e.detail.fromPickup.addressLine}, ${e.detail.fromPickup.city} → ${e.detail.toPickup.addressLine}, ${e.detail.toPickup.city}`);
    return {
      id: e.id,
      at: e.at,
      title: titleFor(t, locale, e.type, { cancelledBy: e.detail?.cancelledBy === "customer" ? "customer" : "store", amount: e.detail?.amount }),
      note: e.customerNote,
      internalNote: e.internalNote,
      detail: parts.join(" · ") || undefined,
      tone: toneFor(e.type),
    };
  });
}

const dot: Record<TimelineEntry["tone"], string> = {
  neutral: "bg-line-strong", success: "bg-success-fg", danger: "bg-danger-fg", warning: "bg-warning-fg", info: "bg-info-fg",
};

export function Timeline({ entries, label, internalLabel, storeMessageLabel }: { entries: TimelineEntry[]; label: string; internalLabel?: string; storeMessageLabel: string }) {
  const fmt = useFormat();
  return (
    <ol aria-label={label} className="space-y-0">
      {[...entries].reverse().map((e, i, arr) => (
        <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < arr.length - 1 && <span aria-hidden className="absolute left-[0.4375rem] top-4 h-full w-px bg-line" />}
          <span aria-hidden className={cn("relative mt-1.5 size-3.5 shrink-0 rounded-full ring-4 ring-surface", dot[e.tone])} />
          <div className="min-w-0 flex-1">
            <p className="text-label font-semibold">{e.title}</p>
            <p className="text-caption text-ink-muted">{fmt.dateTime(e.at)}</p>
            {e.detail && <p className="text-caption mt-1 text-ink-soft">{e.detail}</p>}
            {e.note && (
              <blockquote className="text-label mt-2 rounded-control border-l-2 border-brand-600 bg-brand-50 px-3 py-2 font-normal text-ink">
                <span className="text-caption block font-semibold text-brand-700">{storeMessageLabel}</span>
                {e.note}
              </blockquote>
            )}
            {e.internalNote && (
              <p className="text-label mt-2 rounded-control border border-dashed border-line-strong bg-sand-50 px-3 py-2 font-normal text-ink-soft">
                <span className="text-caption block font-semibold text-ink">{internalLabel}</span>
                {e.internalNote}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SectionCard({ title, children, className, action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("rounded-card border border-line bg-surface p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-h3">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const CheckItem = ({ children }: { children: ReactNode }) => (
  <li className="flex gap-2.5"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-700" /><span>{children}</span></li>
);

export { useLText };

/** The reservation's lines for `OrderLines`, with the unit price that applied and the SERVER's line total. */
export const orderLinesOf = (view: CustomerReservation): DisplayLine[] =>
  view.lines.map((l) => ({ name: l.name, variantLabel: l.variantLabel, quantity: l.quantity, unitPrice: l.unitPrice, unit: l.unit, priceKind: l.priceKind, lineTotal: l.lineTotal }));

/** Pickup as it was promised when this reservation was made (the snapshot), with the instructions that fit its current status. */
export function PickupInfoFor({ view }: { view: CustomerReservation }) {
  const t = useT();
  if (!view.pickup) return <p className="text-label font-normal text-ink-soft">{t("pickup.snapshotMissing")}</p>;
  return <PickupInfo location={view.pickup.location} instructions={view.pickup.instructions} status={view.status} />;
}

/** Per-currency position: total, paid so far, still due. HTG and USD are separate lines and never summed. */
export function PaymentBalances({ balances }: { balances: CustomerReservation["balances"] }) {
  const t = useT();
  const locale = useLocale();
  return (
    <ul className="text-label divide-y divide-line font-normal">
      {balances.map((b) => (
        <li key={b.currency} className="py-2.5 first:pt-0 last:pb-0">
          <p className="font-semibold">{b.currency}</p>
          <dl className="mt-1 grid grid-cols-[1fr_auto] gap-y-0.5 text-ink-soft">
            <dt>{t("track.detail.balanceTotal")}</dt><dd className="tabular-nums text-ink">{formatMoney(b.total, locale)}</dd>
            <dt>{t("track.detail.amountPaid")}</dt><dd className="tabular-nums text-ink">{formatMoney(b.paid, locale)}</dd>
            <dt>{t("track.detail.balanceDue")}</dt><dd className="tabular-nums font-semibold text-ink">{formatMoney(b.due, locale)}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
