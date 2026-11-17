"use client";

import { Banknote, ChevronDown, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ApiErrorState } from "@/components/ui/api-error";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import { OrderLines } from "@/components/ui/order-lines";
import { MoneyRows, MoneyTotals } from "@/components/ui/price";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { dialCodes, market } from "@/config/market";
import { termsConfig } from "@/config/terms";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLText, useLocale, useT } from "@/i18n/provider";
import { useCartCheck } from "@/lib/api/cart-check";
import { apiErrorKey, fieldProblems, isUncertainOutcome, problemOf } from "@/lib/api/errors";
import { usePickupView } from "@/lib/api/pickup-hooks";
import { newIdempotencyKey, submitReservation } from "@/lib/api/public";
import { cn } from "@/lib/cn";
import { rememberAccess, rememberSubmitted } from "@/lib/reservations/access-store";
import { clearPending, keyFor } from "@/lib/reservations/pending-submit";
import { useCart } from "@/lib/stores/cart-store";
import { useSession } from "@/lib/auth/use-session";
import { useOnline } from "@/lib/pwa/store";
import { type Errors, focusFirstInvalid, isBlank, isValidEmail, isValidPhone } from "@/lib/validation";
import { PickupInfo, SectionCard } from "./shared";
import { Stepper } from "./stepper";

interface Contact { firstName: string; lastName: string; dialCode: string; phone: string; email: string }
type ContactErrors = Errors<keyof Contact>;
type StepId = "contact" | "pickup" | "review";
const stepIds: StepId[] = ["contact", "pickup", "review"];

export function ReserveFlow() {
  const t = useT();
  const locale = useLocale();
  const lt = useLText();
  const router = useLocaleRouter();
  const cart = useCart();
  const online = useOnline();
  const { session } = useSession();
  const pickup = usePickupView();
  const check = useCartCheck(cart.lines);
  const terms = termsConfig();

  const [step, setStep] = useState<StepId>("contact");
  const [contact, setContact] = useState<Contact>({ firstName: "", lastName: "", dialCode: market.defaultDialCode, phone: "", email: "" });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackError, setAckError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  /** The request left the browser and no answer came back: it may or may not have been recorded. Retrying with the SAME key is safe. */
  const [uncertain, setUncertain] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRender = useRef(true);

  // Move focus to the step heading whenever the step changes
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [step]);

  if (!cart.ready) return null;
  if (cart.lines.length === 0 && !placed) {
    return (
      <EmptyState icon={<ShoppingBag aria-hidden />} title={t("reserve.emptyTitle")} description={t("reserve.emptyText")}>
        <ButtonLink href="/products">{t("reserve.browse")}</ButtonLink>
      </EmptyState>
    );
  }
  const email = contact.email || session?.email || "";
  const stepIndex = stepIds.indexOf(step);
  const edit = (key: keyof Contact, value: string) => {
    setContact((c) => ({ ...c, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const continueContact = (e: React.FormEvent) => {
    e.preventDefault();
    const next: ContactErrors = {};
    if (isBlank(contact.firstName)) next.firstName = t("validation.firstName");
    if (isBlank(contact.lastName)) next.lastName = t("validation.lastName");
    if (!isValidPhone(contact.phone)) next.phone = t("validation.phone");
    if (!isBlank(email) && !isValidEmail(email)) next.email = t("validation.email");
    setErrors(next);
    if (Object.keys(next).length) { window.setTimeout(() => focusFirstInvalid(formRef.current)); return; }
    setContact((c) => ({ ...c, email }));
    setStep("pickup");
  };

  const submit = async () => {
    if (!terms) return; // no published terms: there is nothing to accept (the button is disabled too)
    if (!acknowledged) { setAckError(true); return; }
    if (Object.keys(check.issues).length > 0) { setSubmitError(t("reserve.review.cartChanged")); return; }
    setAckError(false);
    setSubmitting(true);
    setSubmitError(undefined);
    setUncertain(false);
    // Only identifiers, quantities and currencies are sent: the server finds the product, picks the price (retail, sale or wholesale tier) and snapshots it.
    const body = {
      lines: cart.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, currency: l.unitPrice.currency })),
      contact: { firstName: contact.firstName.trim(), lastName: contact.lastName.trim(), dialCode: contact.dialCode, phone: contact.phone.trim(), email: contact.email.trim() || undefined },
      locale,
      acknowledgedTerms: acknowledged,
    };
    // One key per attempt, reused if the SAME request is sent again after an uncertain outcome (see lib/reservations/pending-submit.ts).
    const key = keyFor(JSON.stringify([body, !!session]), newIdempotencyKey);
    try {
      const dto = await submitReservation(body, key, { signedIn: !!session });
      clearPending();
      rememberAccess(dto.reference, body.contact.phone);
      rememberSubmitted(dto, dto.reference);
      setPlaced(true);
      cart.clear();
      router.push(`/reserve/confirmation/${encodeURIComponent(dto.reference)}`);
    } catch (e) {
      const unsure = isUncertainOutcome(e);
      if (!unsure) clearPending(); // a definite answer: the next attempt is a new request
      setUncertain(unsure);
      const fields = fieldProblems(e);
      const mapped: ContactErrors = {};
      if (fields["contact.firstName"]) mapped.firstName = t("validation.firstName");
      if (fields["contact.lastName"]) mapped.lastName = t("validation.lastName");
      if (fields["contact.phone"] || fields["contact.dialCode"]) mapped.phone = t("validation.phone");
      if (fields["contact.email"]) mapped.email = t("validation.email");
      if (Object.keys(mapped).length) { setErrors(mapped); setStep("contact"); }
      setSubmitError(problemOf(e)?.status === 401 ? t("apiErrors.session_expired") : t(apiErrorKey(e)));
      if (problemOf(e)?.code === "insufficient_stock" || problemOf(e)?.code === "product_unavailable") check.reload();
      setSubmitting(false);
    }
  };

  const heading = "text-h2 outline-none";
  const totals = cart.subtotals;
  const view = pickup.view;
  const unavailable = view?.status !== "available";
  const termsMissing = terms === null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
      <div>
        <Stepper steps={stepIds.map((s) => t(`reserve.steps.${s}`))} current={stepIndex} onJump={(i) => setStep(stepIds[i])} />

        {/* Compact summary on small screens */}
        <details className="group mt-6 rounded-card border border-line bg-surface lg:hidden">
          <summary className="text-label flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold">
            <span className="inline-flex items-center gap-2">{t("cart.summary")} <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" /></span>
            <MoneyTotals totals={totals} />
          </summary>
          <div className="border-t border-line p-4"><OrderLines lines={cart.lines} /></div>
        </details>

        <div className="mt-8">
          {step === "contact" && (
            <form ref={formRef} onSubmit={continueContact} noValidate className="space-y-6">
              <h2 ref={headingRef} tabIndex={-1} className={heading}>{t("reserve.contact.title")}</h2>
              <p className="text-label font-normal text-ink-soft">
                {t("reserve.contact.intro")}{" "}
                {!session && <>{t("reserve.contact.haveAccount")} <Link href="/auth/login" className="font-semibold text-brand-700 underline underline-offset-2">{t("reserve.contact.signIn")}</Link></>}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t("reserve.contact.firstName")} name="given-name" autoComplete="given-name" value={contact.firstName} onChange={(e) => edit("firstName", e.target.value)} error={errors.firstName} />
                <TextField label={t("reserve.contact.lastName")} name="family-name" autoComplete="family-name" value={contact.lastName} onChange={(e) => edit("lastName", e.target.value)} error={errors.lastName} />
                <div className="grid grid-cols-[7.5rem_1fr] gap-3 sm:col-span-2">
                  <SelectField label={t("reserve.contact.dialCode")} value={contact.dialCode} onChange={(e) => edit("dialCode", e.target.value)}>
                    {dialCodes.map((d) => <option key={d} value={d}>{d}</option>)}
                  </SelectField>
                  <TextField label={t("reserve.contact.phone")} type="tel" name="tel-national" autoComplete="tel-national" inputMode="tel" hint={t("reserve.contact.phoneHint")} value={contact.phone} onChange={(e) => edit("phone", e.target.value)} error={errors.phone} />
                </div>
                <TextField label={t("reserve.contact.email")} optional className="sm:col-span-2" type="email" name="email" autoComplete="email" inputMode="email" hint={t("reserve.contact.emailHint")} value={email} onChange={(e) => edit("email", e.target.value)} error={errors.email} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" size="lg">{t("reserve.contact.continue")}</Button>
                <ButtonLink href="/cart" variant="ghost" size="lg">{t("reserve.contact.backToCart")}</ButtonLink>
              </div>
            </form>
          )}

          {step === "pickup" && (
            <div className="space-y-8">
              <h2 ref={headingRef} tabIndex={-1} className={heading}>{t("reserve.pickup.title")}</h2>

              <section aria-labelledby="loc-title" className="space-y-3">
                <h3 id="loc-title" className="text-h3">{t("reserve.pickup.locationTitle")}</h3>
                {pickup.error != null && <ApiErrorState className="py-6" error={pickup.error} onRetry={pickup.reload} />}
                {pickup.error == null && !view && <div role="status" aria-label={t("common.loading")}><Skeleton className="h-40 w-full" /></div>}
                {view?.status === "available" && (
                  <div className="rounded-card border border-line bg-surface p-4"><PickupInfo location={view.location} instructions={view.instructions} /></div>
                )}
                {view?.status === "disabled" && (
                  <Alert tone="warning" live="polite" title={t("reserve.pickup.disabledTitle")}>{lt(view.message) || t("pickup.unavailableDefault")}</Alert>
                )}
                {view?.status === "not_configured" && (
                  <Alert tone="warning" live="polite" title={t("reserve.pickup.notConfiguredTitle")}>{t("reserve.pickup.notConfiguredText")}</Alert>
                )}
              </section>

              <fieldset className="space-y-3">
                <legend className="text-h3">{t("reserve.pickup.payTitle")}</legend>
                <p className="text-label font-normal text-ink-soft">{t("reserve.pickup.payIntro")}</p>
                <PaymentOption id="cash" checked label={t("reserve.payment.cashName")} description={t("reserve.payment.cashDesc")} badge={<Badge tone="success">{t("reserve.payment.available")}</Badge>} icon={<Banknote aria-hidden className="size-5" />} />
                {/* Not operational yet: visible, labelled, and impossible to select */}
                <PaymentOption id="moncash" disabled label={t("reserve.payment.moncash")} description={t("reserve.payment.soonNote")} badge={<Badge>{t("reserve.payment.soon")}</Badge>} />
                <PaymentOption id="natcash" disabled label={t("reserve.payment.natcash")} description={t("reserve.payment.soonNote")} badge={<Badge>{t("reserve.payment.soon")}</Badge>} />
              </fieldset>

              <div className="flex flex-wrap gap-3">
                <Button size="lg" disabled={unavailable} onClick={() => setStep("review")}>{t("reserve.pickup.continue")}</Button>
                <Button variant="ghost" size="lg" onClick={() => setStep("contact")}>{t("common.back")}</Button>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-6">
              <h2 ref={headingRef} tabIndex={-1} className={heading}>{t("reserve.review.title")}</h2>
              <SectionCard title={t("reserve.review.contact")} action={<button type="button" onClick={() => setStep("contact")} className="text-label min-h-9 px-2 font-semibold text-brand-700 underline underline-offset-2">{t("common.edit")}</button>}>
                <p className="text-label">{contact.firstName} {contact.lastName}</p>
                <p className="text-label font-normal text-ink-soft">{contact.dialCode} {contact.phone}{contact.email && <> · {contact.email}</>}</p>
              </SectionCard>
              <SectionCard title={t("reserve.review.pickup")} action={<button type="button" onClick={() => setStep("pickup")} className="text-label min-h-9 px-2 font-semibold text-brand-700 underline underline-offset-2">{t("common.edit")}</button>}>
                {view?.status === "available" && <><p className="text-label font-semibold">{view.location.storeName}</p>
                <p className="text-label font-normal text-ink-soft">{view.location.addressLine}, {view.location.city}</p></>}
                <p className="text-label mt-3 font-semibold">{t("reserve.review.payment")}</p>
                <p className="text-label font-normal text-ink-soft">{t("reserve.payment.cashName")}</p>
              </SectionCard>
              <SectionCard title={t("reserve.review.items")}><OrderLines lines={cart.lines} /></SectionCard>
              <SectionCard title={t("reserve.review.totals")}>
                <MoneyRows label={t("reserve.review.total")} totals={totals} className="text-h3" valueClassName="text-h3" />
                {cart.mixedCurrency && <p className="text-caption mt-2 text-ink-soft">{t("cart.mixedText")}</p>}
                <p className="text-caption mt-2 text-ink-muted">{t("cart.note")}</p>
              </SectionCard>

              <section aria-labelledby="terms-title" className="rounded-card border border-warning-fg/30 bg-warning-bg p-5">
                <h3 id="terms-title" className="text-h3 text-warning-fg">{t("reserve.review.termsTitle")}</h3>
                <ul className="text-label mt-3 list-disc space-y-1.5 pl-5 font-normal text-ink">
                  <li>{t("reserve.review.t1")}</li><li>{t("reserve.review.t2")}</li><li>{t("reserve.review.t3")}</li><li>{t("reserve.review.t4")}</li><li>{t("reserve.review.t5")}</li>
                </ul>
                {terms ? (
                  <>
                    <Checkbox className="mt-4" label={<>{t("reserve.review.accept")}{" "}<span className="font-normal text-ink-soft">({t("reserve.review.termsVersion", { version: terms.version })}{terms.url && <> · <Link href={terms.url} className="font-semibold text-brand-700 underline underline-offset-2">{t("reserve.review.readTerms")}</Link></>})</span></>} checked={acknowledged} onChange={(e) => { setAcknowledged(e.target.checked); setAckError(false); }} aria-invalid={ackError || undefined} />
                    {ackError && <p role="alert" className="text-caption mt-2 font-medium text-danger-fg">{t("reserve.review.acceptRequired")}</p>}
                  </>
                ) : (
                  <Alert tone="warning" live="polite" className="mt-4" title={t("reserve.review.termsMissingTitle")}>{t("reserve.review.termsMissingText")}</Alert>
                )}
              </section>

              {Object.keys(check.issues).length > 0 && <Alert tone="warning" live="polite" title={t("cart.issuesTitle")}>{t("reserve.review.cartChanged")} <Link href="/cart" className="font-semibold underline underline-offset-2">{t("reserve.review.backToCart")}</Link></Alert>}
              {check.error != null && <Alert tone="info" live="polite">{t("cart.checkFailed")}</Alert>}
              {submitError && <Alert tone="danger" live="assertive" title={t("reserve.review.errorTitle")}>{submitError}{uncertain && <span className="mt-1 block">{t("reserve.review.uncertain")}</span>}</Alert>}
              {!online && <Alert tone="warning" live="polite">{t("pwa.reserveOffline")}</Alert>}
              {unavailable && view && <Alert tone="warning" live="polite" title={t("reserve.pickup.disabledTitle")}>{view.status === "disabled" ? lt(view.message) || t("pickup.unavailableDefault") : t("reserve.pickup.notConfiguredText")}</Alert>}
              <div className="flex flex-wrap gap-3">
                <Button size="lg" loading={submitting} disabled={!online || unavailable || termsMissing || Object.keys(check.issues).length > 0} onClick={submit}>{submitting ? t("reserve.review.submitting") : uncertain ? t("reserve.review.retry") : t("reserve.review.submit")}</Button>
                <Button variant="ghost" size="lg" disabled={submitting} onClick={() => setStep("pickup")}>{t("common.back")}</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside aria-label={t("cart.summary")} className="hidden h-fit rounded-card border border-line bg-surface p-5 lg:sticky lg:top-40 lg:block">
        <h2 className="text-h3 mb-4">{t("cart.summary")}</h2>
        <OrderLines lines={cart.lines} />
        <MoneyRows label={t("reserve.review.total")} totals={totals} className="text-label mt-5 border-t border-line pt-4" valueClassName="text-h3" />
        <p className="text-caption mt-2 text-ink-muted">{t("cart.noOnlinePayment")}</p>
      </aside>
    </div>
  );
}

function PaymentOption({ id, label, description, badge, icon, checked = false, disabled = false }: { id: string; label: string; description: string; badge: React.ReactNode; icon?: React.ReactNode; checked?: boolean; disabled?: boolean }) {
  return (
    <label htmlFor={`pay-${id}`} className={cn("flex gap-3 rounded-card border p-4", disabled ? "cursor-not-allowed border-line bg-sand-50 text-ink-muted" : "cursor-default border-brand-700 bg-brand-50 ring-1 ring-brand-700")}>
      <input id={`pay-${id}`} type="radio" name="payment" value={id} checked={checked} disabled={disabled} readOnly onChange={() => undefined} className="mt-1 size-5 accent-brand-700" />
      <span className="flex-1">
        <span className="text-label flex flex-wrap items-center gap-2 font-semibold">{icon}{label}<span className="ml-auto">{badge}</span></span>
        <span className="text-caption mt-1 block text-ink-soft">{description}</span>
      </span>
    </label>
  );
}
