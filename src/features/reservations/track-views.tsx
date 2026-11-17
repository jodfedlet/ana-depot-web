"use client";

import { Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ApiErrorState } from "@/components/ui/api-error";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { OrderLines } from "@/components/ui/order-lines";
import { MoneyRows } from "@/components/ui/price";
import { Skeleton } from "@/components/ui/states";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { apiErrorKey, isSessionProblem } from "@/lib/api/errors";
import { toCustomerReservation } from "@/lib/api/map-reservation";
import { lookupReservation } from "@/lib/api/public";
import { useTrackedReservation } from "@/lib/api/reservation-hooks";
import { useSession } from "@/lib/auth/use-session";
import { normalizeReference, rememberAccess } from "@/lib/reservations/access-store";
import { focusFirstInvalid, isBlank } from "@/lib/validation";
import { PaymentBalances, PaymentStatusBadge, PickupInfoFor, ReservationStatusBadge, SectionCard, Timeline, orderLinesOf, useCustomerTimeline } from "./shared";

/** /reservations — guest lookup. The reference alone is never enough: the phone number is verified by the server too. */
export function LookupForm() {
  const t = useT();
  const router = useLocaleRouter();
  const { session } = useSession();
  const formRef = useRef<HTMLFormElement>(null);
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ reference?: string; phone?: string }>({});
  const [failure, setFailure] = useState<string>();
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (isBlank(reference)) next.reference = t("validation.reference");
    if (isBlank(phone)) next.phone = t("validation.phone");
    setErrors(next);
    setFailure(undefined);
    if (Object.keys(next).length) { window.setTimeout(() => focusFirstInvalid(formRef.current)); return; }
    setLoading(true);
    try {
      const dto = await lookupReservation(reference.trim(), phone.trim());
      if (!toCustomerReservation(dto)) throw new Error("unreadable");
      rememberAccess(dto.reference, phone.trim());
      router.push(`/reservations/${encodeURIComponent(dto.reference)}`);
    } catch (err) {
      // Unknown reference and wrong phone are the same answer from the server and the same message here.
      setFailure(t(apiErrorKey(err)));
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-h1">{t("track.lookup.title")}</h1>
      <p className="text-body mt-2 text-ink-soft">{t("track.lookup.intro")}</p>
      {session && (
        <Alert tone="info" className="mt-5" title={t("track.lookup.signedIn")}>
          <Link href="/account/reservations" className="font-semibold underline underline-offset-2">{t("track.lookup.account")}</Link>
        </Alert>
      )}
      <form ref={formRef} onSubmit={submit} noValidate className="mt-6 space-y-5 rounded-card border border-line bg-surface p-5 sm:p-7">
        {failure && <Alert tone="danger" live="assertive" title={t("track.lookup.errorTitle")}>{failure}</Alert>}
        <TextField label={t("track.lookup.reference")} hint={t("track.lookup.referenceHint")} autoComplete="off" autoCapitalize="characters" spellCheck={false} value={reference} onChange={(e) => { setReference(e.target.value); setErrors((x) => ({ ...x, reference: undefined })); }} error={errors.reference} />
        <TextField label={t("track.lookup.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setErrors((x) => ({ ...x, phone: undefined })); }} error={errors.phone} />
        <Button type="submit" size="lg" full loading={loading}>{t("track.lookup.submit")}</Button>
        <p className="text-caption flex gap-2 text-ink-muted"><Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />{t("track.lookup.privacy")}</p>
      </form>
    </div>
  );
}

function Gate({ reference, verify }: { reference: string; verify: (phone: string) => Promise<import("@/lib/api/http").ApiError | null> }) {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlank(phone)) { setError(t("validation.phone")); return; }
    setError(undefined);
    setLoading(true);
    const failure = await verify(phone.trim());
    // On success the detail view replaces this gate; on failure the answer is the same whether or not the reference exists.
    if (failure) { setError(t(apiErrorKey(failure))); setLoading(false); }
  };
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-h1">{t("track.gate.title")}</h1>
      <p className="text-body mt-2 text-ink-soft">{t("track.gate.text")}</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-5 rounded-card border border-line bg-surface p-5">
        <TextField label={t("track.lookup.reference")} value={reference} readOnly />
        <TextField label={t("track.lookup.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(undefined); }} error={error} />
        <Button type="submit" size="lg" full loading={loading}>{t("track.gate.submit")}</Button>
      </form>
    </div>
  );
}

/**
 * /reservations/[reference]. Everything shown is what the API answers now: for a guest, to reference + phone; for a signed-in owner opening
 * a reservation from their account (`?mine=<id>`), to the session. Internal notes, staff names and ledger entries are not in the response.
 */
export function CustomerReservationDetail({ reference }: { reference: string }) {
  const t = useT();
  const fmt = useFormat();
  const { session } = useSession();
  const mineId = useSearchParams().get("mine") ?? undefined;
  const ref = normalizeReference(reference);
  const { outcome, loading, error, reload, verify } = useTrackedReservation(ref, mineId);
  const view = outcome?.kind === "ready" ? outcome.view : null;
  const timeline = useCustomerTimeline(view?.events ?? []);

  if (error != null) {
    return isSessionProblem(error) && mineId
      ? <Alert tone="warning" live="polite" title={t("apiErrors.session_expired")}><Link href={`/auth/login?next=${encodeURIComponent(`/reservations/${ref}?mine=${mineId}`)}`} className="font-semibold underline underline-offset-2">{t("nav.signIn")}</Link></Alert>
      : <ApiErrorState error={error} onRetry={reload} />;
  }
  if (loading || !outcome) return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-10 w-72" /><Skeleton className="mt-6 h-64 w-full" /></div>;
  // Same screen whether the reference does not exist or the viewer is not verified (no enumeration).
  if (!view) return <Gate reference={ref} verify={verify} />;

  const latestMessage = [...view.events].reverse().find((e) => e.note);
  return (
    <div className="space-y-6">
      <div>
        <Link href={session ? "/account/reservations" : "/reservations"} className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">← {session ? t("track.detail.allReservations") : t("track.detail.back")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-h1" translate="no">{t("track.detail.title", { reference: view.reference })}</h1>
          <ReservationStatusBadge status={view.status} />
        </div>
        <p className="text-body mt-1 text-ink-soft">{t("track.detail.submittedOn", { date: fmt.date(view.createdAt) })}</p>
      </div>

      <Alert tone={view.status === "ready_for_pickup" ? "success" : view.status === "rejected" || view.status === "cancelled" || view.status === "expired" ? "danger" : "info"} live="polite" title={t(`status.${view.status}`)}>
        {t(`statusDescription.${view.status}`)}
        {view.expiresAt && view.status === "ready_for_pickup" && <span className="mt-1 block font-semibold">{t("track.detail.expiresOn", { date: fmt.date(view.expiresAt) })}</span>}
      </Alert>

      {latestMessage?.note && (
        <section aria-labelledby="msg-title" className="rounded-card border-l-4 border-brand-600 bg-brand-50 p-4">
          <h2 id="msg-title" className="text-label font-semibold text-brand-700">{t("track.detail.messages")}</h2>
          <p className="text-body mt-1 text-ink">{latestMessage.note}</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <SectionCard title={t("track.detail.items")}>
            <OrderLines lines={orderLinesOf(view)} />
            <MoneyRows label={t("track.detail.total")} totals={view.totals} className="text-label mt-4 border-t border-line pt-3" valueClassName="text-h3" />
          </SectionCard>
          <SectionCard title={t("track.detail.timeline")}>
            <Timeline entries={timeline} label={t("track.detail.timeline")} storeMessageLabel={t("events.storeMessage")} />
          </SectionCard>
        </div>
        <div className="space-y-6">
          <SectionCard title={t("track.detail.payment")}>
            <dl className="text-label space-y-2 font-normal">
              <div className="flex justify-between gap-3"><dt className="text-ink-soft">{t("track.detail.paymentMethod")}</dt><dd>{t("paymentMethod.cash_at_pickup")}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-soft">{t("track.detail.paymentStatus")}</dt><dd><PaymentStatusBadge status={view.payment.status} /></dd></div>
            </dl>
            <div className="mt-3 border-t border-line pt-3"><PaymentBalances balances={view.balances} /></div>
            {view.payment.status !== "paid" && <p className="text-caption mt-3 text-ink-soft">{t("track.detail.payAtStore")}</p>}
          </SectionCard>
          <SectionCard title={t("pickup.title")}>
            <PickupInfoFor view={view} />
          </SectionCard>
          <SectionCard title={t("track.detail.contact")}>
            <p className="text-label">{view.customer.name}</p>
            <p className="text-label font-normal text-ink-soft">{view.customer.phone}{view.customer.email && <><br />{view.customer.email}</>}</p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
