"use client";

import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { ApiErrorState } from "@/components/ui/api-error";
import { TextField } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/states";
import { useLocale, useT } from "@/i18n/provider";
import { apiErrorKey } from "@/lib/api/errors";
import { usePayerAccess, usePaymentStatus } from "@/lib/api/online-payment-hooks";
import { getPaymentStatus, type PaymentStatusView } from "@/lib/api/online-payments";
import { formatMoney } from "@/lib/money";
import { isReferenceShape } from "@/lib/payments/online";
import { normalizeReference, rememberAccess } from "@/lib/reservations/access-store";
import { isBlank } from "@/lib/validation";
import { PaymentBalances } from "@/features/reservations/shared";

/**
 * Where Stripe sends the customer back to. Arriving here proves NOTHING: the page asks the backend for the real state (which only changes after a verified,
 * signed provider event) and shows pending / processing / confirmed / failed / expired from that answer. Reservation and balances are shown per currency.
 */
export function PaymentReturnView() {
  const t = useT();
  const params = useSearchParams();
  const reference = normalizeReference(params.get("reference") ?? "");
  const attemptId = params.get("attempt") ?? undefined;
  if (!isReferenceShape(reference)) return <Alert tone="warning" live="polite">{t("onlinePay.return.missingReference")}</Alert>;
  return <Content reference={reference} attemptId={attemptId} />;
}

function Content({ reference, attemptId }: { reference: string; attemptId?: string }) {
  const t = useT();
  const locale = useLocale();
  const access = usePayerAccess(reference);
  const st = usePaymentStatus(reference, access, attemptId);

  if (!access) return <PhoneGate reference={reference} attemptId={attemptId} />;
  if (st.error != null && !st.view) return <ApiErrorState error={st.error} onRetry={st.reload} />;
  if (!st.view) return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-10 w-72" /><Skeleton className="mt-6 h-48 w-full" /></div>;

  const { view, current } = st;
  const remaining = view.balances.filter((b) => b.due.amount > 0);
  const status = current?.status ?? null;
  const tone = status === "SUCCEEDED" ? "success" : status === "FAILED" || status === "EXPIRED" ? "danger" : "info";
  const Icon = status === "SUCCEEDED" ? CheckCircle2 : status === "FAILED" || status === "EXPIRED" ? XCircle : status === "PROCESSING" ? Clock : Loader2;
  const key = status === "SUCCEEDED" ? "success" : status === "FAILED" ? "failed" : status === "EXPIRED" ? "expired" : status === "PROCESSING" ? "processing" : "checking";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <p className="text-eyebrow text-ink-muted">{t("onlinePay.return.title")}</p>
        <h1 className="text-h1 mt-1" translate="no">{reference}</h1>
      </header>

      <section aria-live="polite" className="rounded-card border border-line bg-surface p-5">
        <div className="flex gap-3">
          <Icon aria-hidden className={`mt-0.5 size-6 shrink-0 ${status === "SUCCEEDED" ? "text-success-fg" : status === "FAILED" || status === "EXPIRED" ? "text-danger-fg" : "text-brand-700"} ${!status || status === "PENDING" ? "animate-spin" : ""}`} />
          <div>
            <h2 className="text-h3">{t(`onlinePay.return.${key}Title` as never)}</h2>
            <p className="text-body mt-1 text-ink-soft">{t(`onlinePay.return.${key}Text` as never, { amount: current ? formatMoney(current.amount, locale) : "" })}</p>
          </div>
        </div>
        {st.stopped && (
          <Alert tone={tone === "danger" ? "danger" : "info"} className="mt-4" live="polite">{t("onlinePay.return.stoppedPolling")}</Alert>
        )}
        {st.open && (
          <Button variant="outline" size="sm" className="mt-4" loading={st.loading} onClick={st.checkAgain}>{t("onlinePay.return.checkAgain")}</Button>
        )}
      </section>

      <section aria-labelledby="remaining-title" className="rounded-card border border-line bg-surface p-5">
        <h2 id="remaining-title" className="text-h3">{t("onlinePay.return.remaining")}</h2>
        {remaining.length === 0 ? <p className="text-label mt-2 font-normal text-ink-soft">{t("onlinePay.return.allPaid")}</p> : (
          <>
            <div className="mt-3"><PaymentBalances balances={remaining} /></div>
            <p className="text-caption mt-3 text-ink-muted">{t("onlinePay.return.remainingNote")}</p>
          </>
        )}
      </section>

      <AttemptsList view={view} />

      <div className="flex flex-wrap gap-3">
        <ButtonLink href={access?.kind === "owner" ? "/account/reservations" : `/reservations/${encodeURIComponent(reference)}`} size="lg">{t("onlinePay.return.backToReservation")}</ButtonLink>
      </div>
    </div>
  );
}

function AttemptsList({ view }: { view: PaymentStatusView }) {
  const t = useT();
  const locale = useLocale();
  if (view.attempts.length < 2) return null;
  return (
    <section aria-labelledby="attempts-title" className="rounded-card border border-line bg-surface p-5">
      <h2 id="attempts-title" className="text-h3">{t("onlinePay.return.attemptsTitle")}</h2>
      <ul className="text-label mt-3 divide-y divide-line font-normal">
        {view.attempts.map((a) => <li key={a.id} className="flex justify-between gap-3 py-2"><span className="tabular-nums">{formatMoney(a.amount, locale)}</span><span className="text-ink-soft">{t(`onlinePay.attemptStatus.${a.status}`)}</span></li>)}
      </ul>
    </section>
  );
}

/** A guest who opens this page in a new tab (no phone remembered) proves the reservation with the phone used when reserving. A wrong phone gets the same answer as an unknown reference. */
function PhoneGate({ reference, attemptId }: { reference: string; attemptId?: string }) {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlank(phone)) { setError(t("validation.phone")); return; }
    setError(undefined);
    setLoading(true);
    try {
      await getPaymentStatus(reference, { kind: "guest", phone: phone.trim() }, attemptId);
      rememberAccess(reference, phone.trim());
      setDone(true);
    } catch (err) {
      setError(t(apiErrorKey(err)));
      setLoading(false);
    }
  };
  if (done) return <Content reference={reference} attemptId={attemptId} />;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-h1">{t("onlinePay.return.phoneTitle")}</h1>
      <p className="text-body mt-2 text-ink-soft">{t("onlinePay.return.phoneText")}</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-5 rounded-card border border-line bg-surface p-5">
        <TextField label={t("track.lookup.reference")} value={reference} readOnly />
        <TextField label={t("track.lookup.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(undefined); }} error={error} />
        <Button type="submit" size="lg" full loading={loading}>{t("onlinePay.return.phoneSubmit")}</Button>
      </form>
    </div>
  );
}
