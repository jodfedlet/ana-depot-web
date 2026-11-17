"use client";

import { CalendarClock, Check, Copy, PackageOpen } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { OrderLines } from "@/components/ui/order-lines";
import { MoneyRows } from "@/components/ui/price";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useT } from "@/i18n/provider";
import { toCustomerReservation } from "@/lib/api/map-reservation";
import type { ReservationViewDto } from "@/lib/api/dto";
import type { CustomerReservation } from "@/lib/reservations/customer-view";
import { recallSubmittedRaw } from "@/lib/reservations/access-store";
import { useSession } from "@/lib/auth/use-session";
import { PickupInfoFor, ReservationStatusBadge, SectionCard, orderLinesOf } from "./shared";

const subscribeNever = () => () => {};

/**
 * Shown right after submission. It displays the server's OWN answer to the submission (the 201 body, kept for this tab), so it costs no extra request, and
 * states what the server says: normally "received, pending review". It never says confirmed, paid or ready unless the status says so.
 * Opened without that answer (another browser or tab) it points to tracking, which asks the server with reference + phone.
 */
export function ConfirmationView({ reference }: { reference: string }) {
  const t = useT();
  const { session } = useSession();
  // sessionStorage exists only in the browser: `undefined` while rendering on the server / hydrating, then the stored answer or null
  const raw = useSyncExternalStore(subscribeNever, () => recallSubmittedRaw(reference), () => undefined);
  const view = useMemo<CustomerReservation | null | undefined>(() => (raw === undefined ? undefined : raw === null ? null : toCustomerReservation(JSON.parse(raw) as ReservationViewDto)), [raw]);
  const [copied, setCopied] = useState(false);

  if (view === undefined) return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-10 w-80" /><Skeleton className="mt-6 h-64 w-full" /></div>;
  if (view === null) {
    // Opened without the access this tab holds (another browser, or a closed tab): the tracking page asks for the phone number.
    return (
      <EmptyState icon={<PackageOpen aria-hidden />} title={t("reserve.confirmation.notFoundTitle")} description={t("reserve.confirmation.notFoundText")}>
        <ButtonLink href={`/reservations/${encodeURIComponent(reference)}`}>{t("nav.trackReservation")}</ButtonLink>
      </EmptyState>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(view.reference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the reference is selectable text */
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-warning-bg text-warning-fg"><CalendarClock aria-hidden className="size-6" /></span>
        <div>
          <ReservationStatusBadge status={view.status} />
          <h1 className="text-h1 mt-2">{t("reserve.confirmation.title")}</h1>
          <p className="text-body mt-2 text-ink-soft">{t("reserve.confirmation.lead")}</p>
        </div>
      </header>

      {view.status === "pending_review" && <Alert tone="warning" title={t("reserve.confirmation.notConfirmedTitle")}>{t("reserve.confirmation.notConfirmedText")}</Alert>}

      <section aria-labelledby="ref-title" className="rounded-card border-2 border-brand-700 bg-surface p-5 text-center">
        <h2 id="ref-title" className="text-eyebrow text-ink-muted">{t("reserve.confirmation.reference")}</h2>
        <p className="mt-2 select-all font-display text-4xl tracking-wide text-ink" translate="no">{view.reference}</p>
        <p className="text-caption mt-2 text-ink-soft">{t("reserve.confirmation.keepReference")}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={copy}>
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
        <span role="status" className="sr-only">{copied ? t("common.copied") : ""}</span>
      </section>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <SectionCard title={t("reserve.review.items")}>
          <OrderLines lines={orderLinesOf(view)} />
          <MoneyRows label={t("reserve.review.total")} totals={view.totals} className="text-label mt-4 border-t border-line pt-3" valueClassName="text-h3" />
          <p className="text-caption mt-3 text-ink-soft">{t("reserve.review.payment")} : {t("paymentMethod.cash_at_pickup")} — {t(`paymentStatus.${view.payment.status}`)}</p>
        </SectionCard>
        <SectionCard title={t("reserve.review.pickup")}>
          <PickupInfoFor view={view} />
        </SectionCard>
      </div>

      <SectionCard title={t("track.detail.contact")}>
        <p className="text-label">{view.customer.name}</p>
        <p className="text-label font-normal text-ink-soft">{view.customer.phone}{view.customer.email && <> · {view.customer.email}</>}</p>
      </SectionCard>

      <section aria-labelledby="next-title" className="rounded-card border border-line bg-surface p-5">
        <h2 id="next-title" className="text-h3 mb-3">{t("reserve.confirmation.nextTitle")}</h2>
        <ol className="text-label list-decimal space-y-2 pl-5 font-normal text-ink-soft">
          <li>{t("reserve.confirmation.n1")}</li><li>{t("reserve.confirmation.n2")}</li><li>{t("reserve.confirmation.n3")}</li><li>{t("reserve.confirmation.n4")}</li>
        </ol>
      </section>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/reservations/${encodeURIComponent(view.reference)}`} size="lg">{t("reserve.confirmation.track")}</ButtonLink>
        <ButtonLink href="/products" size="lg" variant="outline">{t("reserve.confirmation.continue")}</ButtonLink>
        {!session && <ButtonLink href="/auth/sign-up" size="lg" variant="ghost">{t("reserve.confirmation.createAccount")}</ButtonLink>}
      </div>
    </div>
  );
}
