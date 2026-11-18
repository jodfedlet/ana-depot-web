"use client";

import { CreditCard, Lock, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/provider";
import { createCheckoutSession, type PayerAccess } from "@/lib/api/online-payments";
import { usePaymentOptions } from "@/lib/api/online-payment-hooks";
import { apiErrorKey, isUncertainOutcome } from "@/lib/api/errors";
import { attemptKey, endAttempt } from "@/lib/api/idempotency";
import { formatMoney } from "@/lib/money";
import { acceptsOnlinePayment, announcesOnlinePayment, isSafeCheckoutUrl, splitDue } from "@/lib/payments/online";
import type { CustomerReservation } from "@/lib/reservations/customer-view";

/**
 * "How do I pay?" for ONE reservation. Pay at pickup is always the first, default way and needs no card. The online option (hosted Stripe Checkout) only
 * appears when the backend offers it AND the reservation can take a payment (ready for pickup): one button per currency still owed, never a combined total,
 * never a conversion. A session is created ONLY on click; the browser is then sent to the URL the backend returned (checked to be Stripe's https host first).
 * Success is never decided here: the return page asks the backend.
 */
export function OnlinePayPanel({ view, access }: { view: CustomerReservation; access: PayerAccess | null }) {
  const t = useT();
  const locale = useLocale();
  const { currencies, loading, online: onlineStatus } = usePaymentOptions();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; uncertain: boolean } | null>(null);

  // Coming back with the browser's back button can restore this page with the button still busy: reset it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setBusy(null); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  if (loading) return null;
  if (view.payment.status === "paid") return null;
  // switched on but the provider cannot be reached: say so (the reservation and paying at pickup are unaffected) instead of silently offering nothing
  if (currencies.length === 0 && onlineStatus === "temporarily_unavailable" && acceptsOnlinePayment(view.status)) {
    return <Alert tone="info" live="polite">{t("onlinePay.temporarilyUnavailable")}</Alert>;
  }
  if (currencies.length === 0) return null;
  const { online, atStoreOnly } = splitDue(view.balances, currencies);
  const ready = acceptsOnlinePayment(view.status);
  if (!ready && !announcesOnlinePayment(view.status)) return null;

  const pay = async (currency: string) => {
    if (!access) { setError({ key: "apiErrors.session_expired", uncertain: false }); return; }
    setBusy(currency);
    setError(null);
    const scope = `checkout:${view.reference}:${currency}`;
    const key = attemptKey(scope, { reference: view.reference, currency }); // an uncertain retry reuses this key: the backend can only hand back the same session
    try {
      const session = await createCheckoutSession(view.reference, currency, access, key);
      endAttempt(scope); // a definite answer: the next click is a new request (an old, expired session must never be replayed)
      if (!isSafeCheckoutUrl(session.checkoutUrl)) { setError({ key: "onlinePay.redirectRefused", uncertain: false }); setBusy(null); return; }
      window.location.assign(session.checkoutUrl); // a normal browser redirect to Stripe-hosted Checkout; the button stays busy until the page unloads
    } catch (e) {
      const uncertain = isUncertainOutcome(e);
      if (!uncertain) endAttempt(scope);
      setError({ key: apiErrorKey(e), uncertain });
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded-control border border-line bg-sand-50 p-4" data-testid="online-pay">
      <div className="flex gap-3">
        <Store aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-700" />
        <div>
          <p className="text-label font-semibold">{t("onlinePay.atPickup")}</p>
          <p className="text-caption text-ink-soft">{t("onlinePay.atPickupText")}</p>
        </div>
      </div>
      {!ready && <p className="text-caption flex gap-2 text-ink-soft"><CreditCard aria-hidden className="mt-0.5 size-4 shrink-0" />{t("onlinePay.announce")}</p>}
      {ready && atStoreOnly.map((b) => <p key={b.currency} className="text-caption text-ink-soft">{t("onlinePay.notOffered", { currency: b.currency })}</p>)}
      {ready && online.length > 0 && (
        <div className="space-y-3 border-t border-line pt-3">
          <div className="flex gap-3">
            <CreditCard aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-700" />
            <div>
              <p className="text-label font-semibold">{t("onlinePay.online")}</p>
              <p className="text-caption flex items-center gap-1 text-ink-soft"><Lock aria-hidden className="size-3" />{t("onlinePay.secureStripe")}</p>
            </div>
          </div>
          {online.map((b) => (
            <Button key={b.currency} full size="lg" loading={busy === b.currency} disabled={busy !== null || !access} onClick={() => pay(b.currency)}>
              {busy === b.currency ? t("onlinePay.payButtonBusy") : t("onlinePay.payButton", { amount: formatMoney(b.due, locale) })}
            </Button>
          ))}
          {online.length > 0 && <p className="text-caption text-ink-muted">{online.length > 1 ? `${t("onlinePay.payOneCurrency")} ` : ""}{t("onlinePay.redirectNote")}</p>}
          {error && <Alert tone="danger" live="assertive">{t(error.key as never)}{error.uncertain && <span className="mt-1 block">{t("reserve.review.uncertain")}</span>}</Alert>}
        </div>
      )}
    </div>
  );
}
