"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { PickupInfo } from "@/features/reservations/shared";
import { type Locale, locales } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { runReservationAction, type ServiceError } from "@/lib/api/reservations";
import { L, type LText, pick } from "@/lib/localized";
import { formatMoney, majorToMinor, minorToMajor } from "@/lib/money";
import { type PickupSnapshot, snapshotFromSettings } from "@/lib/pickup/types";
import { noteTemplates } from "@/lib/reservations/templates";
import { type Reservation, type RejectReason, rejectReasons } from "@/lib/reservations/types";
import { type Action, balances } from "@/lib/reservations/workflow";
import { useAdminSession } from "@/features/admin/admin-identity";
import { usePickup } from "@/lib/stores/pickup-store";

export type DialogKind = "accept" | "reject" | "ready" | "payment" | "collect" | "cancel" | "expire" | "note-customer" | "note-internal" | "pickup";

const titleKey: Record<DialogKind, MessageKey> = {
  accept: "admin.detail.dialogs.accept.title",
  reject: "admin.detail.dialogs.reject.title",
  ready: "admin.detail.dialogs.ready.title",
  payment: "admin.detail.dialogs.payment.title",
  collect: "admin.detail.dialogs.collect.title",
  cancel: "admin.detail.dialogs.cancel.title",
  expire: "admin.detail.dialogs.expire.title",
  "note-customer": "admin.detail.dialogs.note.titleCustomer",
  "note-internal": "admin.detail.dialogs.note.titleInternal",
  pickup: "admin.detail.dialogs.pickup.title",
};
const toastKey: Record<DialogKind, MessageKey> = {
  accept: "admin.detail.toasts.accepted", reject: "admin.detail.toasts.rejected", ready: "admin.detail.toasts.ready", payment: "admin.detail.toasts.payment",
  collect: "admin.detail.toasts.collected", cancel: "admin.detail.toasts.cancelled", expire: "admin.detail.toasts.expired",
  "note-customer": "admin.detail.toasts.note", "note-internal": "admin.detail.toasts.note", pickup: "admin.detail.toasts.pickup",
};
/** Which actions end with a customer-visible effect (so the demo says "customer will be notified"). */
const notifiesCustomer: DialogKind[] = ["accept", "reject", "ready", "cancel", "note-customer", "pickup"];

export function ReservationActionDialog({ reservation, kind, onClose }: { reservation: Reservation; kind: DialogKind | null; onClose: () => void }) {
  const t = useT();
  return (
    <Drawer open={kind !== null} onClose={onClose} title={kind ? t(titleKey[kind]) : ""} side="center">
      {kind && <DialogBody key={`${kind}-${reservation.id}-${reservation.events.length}`} reservation={reservation} kind={kind} onClose={onClose} />}
    </Drawer>
  );
}

function DialogBody({ reservation, kind, onClose }: { reservation: Reservation; kind: DialogKind; onClose: () => void }) {
  const t = useT();
  const uiLocale = useLocale();
  const toast = useToast();
  const { session } = useAdminSession();
  const { settings } = usePickup();
  const customerLocale: Locale = reservation.locale;
  const staffName = session?.name ?? "Staff";

  // shared fields
  const [customerNote, setCustomerNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // per-kind fields
  const [reason, setReason] = useState<RejectReason>("product_unavailable");
  const [cancelReason, setCancelReason] = useState("");
  const [confirmA, setConfirmA] = useState(false); // pickupConfirmed / handoverConfirmed / operationalCheck
  // A payment settles ONE currency. Mixed reservations show a balance per currency and a currency choice.
  const bal = balances(reservation);
  const [currency, setCurrency] = useState(() => (bal.find((b) => b.due > 0) ?? bal[0]).currency);
  const due = bal.find((b) => b.currency === currency)?.due ?? 0;
  const [amount, setAmount] = useState(() => String(minorToMajor(due, currency)));
  const [receivedAt, setReceivedAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [receiptRef, setReceiptRef] = useState("");
  const [noteText, setNoteText] = useState("");
  const [pickupMode, setPickupMode] = useState<"default" | "custom">("default");
  const loc = reservation.pickup.location;
  const [custom, setCustom] = useState({ storeName: loc.storeName, addressLine: loc.addressLine, city: loc.city, region: loc.region, phone: loc.phone, fr: loc.additionalLocationInfo.fr, ht: loc.additionalLocationInfo.ht });

  const languageName = t(`admin.detail.dialogs.languageName.${customerLocale}`);
  const template = (l: LText) => pick(l, customerLocale);
  const fill = (text: string) => setCustomerNote(text);

  const customerNoteField = (tpl?: LText, error?: string) => (
    <div>
      <TextAreaField label={t("admin.detail.dialogs.customerNote")} hint={t("admin.detail.dialogs.customerNoteHint", { language: languageName })} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} error={error} lang={customerLocale} />
      {tpl && <Button variant="ghost" size="sm" className="-ml-2 mt-1" onClick={() => fill(template(tpl))}>{t("admin.detail.dialogs.template")}</Button>}
    </div>
  );
  const internalField = <TextAreaField label={t("admin.detail.dialogs.internalNote")} hint={t("admin.detail.dialogs.internalNoteHint")} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} />;

  const submit = async (action: Action) => {
    setBusy(true);
    setError(undefined);
    const result = await runReservationAction(reservation.id, action, { kind: "staff", name: staffName });
    setBusy(false);
    if (!result.ok) { setError(t(`serviceErrors.${result.error as ServiceError}`)); return; }
    toast.show({ tone: "success", message: `${t(toastKey[kind])}${notifiesCustomer.includes(kind) ? ` ${t("admin.demo.notified")}` : ""}` });
    onClose();
  };

  const confirm = () => {
    const errs: Record<string, string> = {};
    switch (kind) {
      case "accept": return submit({ type: "accept", customerNote, internalNote });
      case "reject":
        if (reason === "other" && !customerNote.trim()) { errs.customerNote = t("admin.detail.dialogs.reject.explanationRequired"); break; }
        return submit({ type: "reject", reason, customerNote: customerNote || template(noteTemplates.rejected[reason]), internalNote });
      case "ready":
        if (!confirmA) { errs.confirm = t("validation.confirmCheckbox"); break; }
        return submit({ type: "markReady", pickupConfirmed: true, customerNote, internalNote });
      case "payment": {
        const n = Number(amount.replace(",", "."));
        if (!Number.isFinite(n) || n <= 0) { errs.amount = t("validation.amount"); break; }
        return submit({ type: "recordPayment", amount: majorToMinor(n, currency), currency, receivedAt: new Date(receivedAt).toISOString(), reference: receiptRef, internalNote });
      }
      case "collect":
        if (!confirmA) { errs.confirm = t("validation.confirmCheckbox"); break; }
        return submit({ type: "collect", handoverConfirmed: true, internalNote });
      case "cancel":
        if (!cancelReason.trim()) { errs.cancelReason = t("validation.reason"); break; }
        if ((reservation.status === "confirmed" || reservation.status === "ready_for_pickup") && !confirmA) { errs.confirm = t("validation.confirmCheckbox"); break; }
        return submit({ type: "cancel", reason: cancelReason, operationalCheck: confirmA, customerNote: customerNote || template(noteTemplates.cancelled), internalNote });
      case "expire": return submit({ type: "expire", internalNote });
      case "note-customer":
        if (!noteText.trim()) { errs.noteText = t("serviceErrors.note_empty"); break; }
        return submit({ type: "addNote", visibility: "customer", text: noteText });
      case "note-internal":
        if (!noteText.trim()) { errs.noteText = t("serviceErrors.note_empty"); break; }
        return submit({ type: "addNote", visibility: "internal", text: noteText });
      case "pickup": {
        let to: PickupSnapshot;
        if (pickupMode === "default") to = snapshotFromSettings(settings, new Date().toISOString());
        else {
          if (!custom.addressLine.trim()) { errs.addressLine = t("validation.required"); }
          if (!custom.city.trim()) { errs.city = t("validation.required"); }
          if (!custom.storeName.trim()) { errs.storeName = t("validation.required"); }
          if (Object.keys(errs).length) break;
          to = { location: { ...loc, storeName: custom.storeName.trim(), addressLine: custom.addressLine.trim(), city: custom.city.trim(), region: custom.region.trim(), phone: custom.phone.trim() || loc.phone, additionalLocationInfo: L(custom.fr, custom.ht) }, instructions: reservation.pickup.instructions, capturedAt: new Date().toISOString(), origin: "override" };
        }
        return submit({ type: "changePickup", to: { ...to, origin: "override" }, customerNote: customerNote || template(noteTemplates.pickupChanged), internalNote });
      }
    }
    setFieldErrors(errs);
  };

  const dangerous = kind === "reject" || kind === "cancel" || kind === "expire";
  const confirmLabel: Record<DialogKind, MessageKey> = {
    accept: "admin.detail.dialogs.accept.confirm", reject: "admin.detail.dialogs.reject.confirm", ready: "admin.detail.dialogs.ready.confirm", payment: "admin.detail.dialogs.payment.confirm",
    collect: "admin.detail.dialogs.collect.confirm", cancel: "admin.detail.dialogs.cancel.confirm", expire: "admin.detail.dialogs.expire.confirm",
    "note-customer": "admin.detail.dialogs.note.confirm", "note-internal": "admin.detail.dialogs.note.confirm", pickup: "admin.detail.dialogs.pickup.confirm",
  };
  const clear = (k: string) => setFieldErrors((e) => ({ ...e, [k]: "" }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); void confirm(); }} noValidate className="flex max-h-[70dvh] flex-col">
      <div className="space-y-4 overflow-y-auto pr-1">
        {kind === "accept" && <><p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.accept.text")}</p>{customerNoteField(noteTemplates.accept)}{internalField}</>}

        {kind === "reject" && (
          <>
            <p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.reject.text")}</p>
            <SelectField label={t("admin.detail.dialogs.reject.reason")} value={reason} onChange={(e) => { const r = e.target.value as RejectReason; setReason(r); setCustomerNote(template(noteTemplates.rejected[r])); }}>
              {rejectReasons.map((r) => <option key={r} value={r}>{t(`rejectReasons.${r}`)}</option>)}
            </SelectField>
            <div>
              <TextAreaField label={t("admin.detail.dialogs.reject.explanation")} hint={reason === "other" ? t("admin.detail.dialogs.reject.explanationRequired") : t("admin.detail.dialogs.customerNoteHint", { language: languageName })} value={customerNote || template(noteTemplates.rejected[reason])} onChange={(e) => { setCustomerNote(e.target.value); clear("customerNote"); }} error={fieldErrors.customerNote} lang={customerLocale} />
            </div>
            {internalField}
          </>
        )}

        {kind === "ready" && (
          <>
            <p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.ready.text")}</p>
            <div className="rounded-card border border-line bg-sand-50 p-3"><p className="text-label mb-2 font-semibold">{t("admin.detail.dialogs.ready.recap")}</p><PickupInfo location={reservation.pickup.location} instructions={reservation.pickup.instructions} localeOverride={customerLocale} /></div>
            <Checkbox label={t("admin.detail.dialogs.ready.confirmPickup")} checked={confirmA} onChange={(e) => { setConfirmA(e.target.checked); clear("confirm"); }} />
            {fieldErrors.confirm && <p role="alert" className="text-caption font-medium text-danger-fg">{fieldErrors.confirm}</p>}
            {customerNoteField(noteTemplates.ready)}{internalField}
          </>
        )}

        {kind === "payment" && (
          <>
            <p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.payment.text")}</p>
            {bal.map((b) => <p key={b.currency} className="text-label font-semibold">{t("admin.detail.dialogs.payment.due", { amount: formatMoney({ amount: b.due, currency: b.currency }, uiLocale) })}</p>)}
            {bal.length > 1 && (
              <SelectField label={t("admin.detail.dialogs.payment.currency")} hint={t("admin.detail.dialogs.payment.currencyHint")} value={currency}
                onChange={(e) => { const c = e.target.value; setCurrency(c); setAmount(String(minorToMajor(bal.find((b) => b.currency === c)?.due ?? 0, c))); clear("amount"); }}>
                {bal.map((b) => <option key={b.currency} value={b.currency} disabled={b.due === 0}>{b.currency}</option>)}
              </SelectField>
            )}
            <TextField label={t("admin.detail.dialogs.payment.amount", { currency })} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); clear("amount"); }} error={fieldErrors.amount} />
            <Button variant="ghost" size="sm" className="-ml-2 -mt-2" onClick={() => setAmount(String(minorToMajor(due, currency)))}>{t("admin.detail.dialogs.payment.fillDue")}</Button>
            <TextField label={t("admin.detail.dialogs.payment.method")} value={t("paymentMethod.cash_at_pickup")} readOnly />
            <TextField label={t("admin.detail.dialogs.payment.receivedAt")} type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
            <TextField label={t("admin.detail.dialogs.payment.reference")} optional value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} />
            {internalField}
          </>
        )}

        {kind === "collect" && (
          <>
            <p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.collect.text")}</p>
            <p className="text-label font-semibold">{t("admin.detail.dialogs.collect.payment", { status: t(`paymentStatus.${reservation.payment.status}`) })}</p>
            {reservation.payment.status !== "paid" && <Alert tone="warning" live="polite">{t("admin.detail.actions.collectBlocked")}</Alert>}
            <Checkbox label={t("admin.detail.dialogs.collect.confirmHandover")} checked={confirmA} onChange={(e) => { setConfirmA(e.target.checked); clear("confirm"); }} />
            {fieldErrors.confirm && <p role="alert" className="text-caption font-medium text-danger-fg">{fieldErrors.confirm}</p>}
            {internalField}
          </>
        )}

        {kind === "cancel" && (
          <>
            <p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.cancel.text")}</p>
            {(reservation.status === "confirmed" || reservation.status === "ready_for_pickup") && <Alert tone="warning">{t("admin.detail.dialogs.cancel.promised")}</Alert>}
            {reservation.payment.status !== "unpaid" && <Alert tone="danger" live="polite">{t("admin.detail.dialogs.cancel.paid")}</Alert>}
            <TextField label={t("admin.detail.dialogs.cancel.reason")} value={cancelReason} onChange={(e) => { setCancelReason(e.target.value); clear("cancelReason"); }} error={fieldErrors.cancelReason} />
            {(reservation.status === "confirmed" || reservation.status === "ready_for_pickup") && (
              <><Checkbox label={t("admin.detail.dialogs.cancel.check")} checked={confirmA} onChange={(e) => { setConfirmA(e.target.checked); clear("confirm"); }} />{fieldErrors.confirm && <p role="alert" className="text-caption font-medium text-danger-fg">{fieldErrors.confirm}</p>}</>
            )}
            {customerNoteField(noteTemplates.cancelled)}{internalField}
          </>
        )}

        {kind === "expire" && <><p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.expire.text")}</p>{internalField}</>}

        {(kind === "note-customer" || kind === "note-internal") && (
          kind === "note-customer"
            ? <TextAreaField label={t("admin.detail.dialogs.customerNote")} hint={t("admin.detail.dialogs.customerNoteHint", { language: languageName })} value={noteText} onChange={(e) => { setNoteText(e.target.value); clear("noteText"); }} error={fieldErrors.noteText} lang={customerLocale} />
            : <TextAreaField label={t("admin.detail.dialogs.internalNote")} hint={t("admin.detail.dialogs.internalNoteHint")} value={noteText} onChange={(e) => { setNoteText(e.target.value); clear("noteText"); }} error={fieldErrors.noteText} />
        )}

        {kind === "pickup" && (
          <>
            <p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.pickup.text")}</p>
            <fieldset className="space-y-2">
              {(["default", "custom"] as const).map((m) => (
                <label key={m} className="text-label flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line-strong px-3 has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50">
                  <input type="radio" name="pickup-mode" className="size-5 accent-brand-700" checked={pickupMode === m} onChange={() => setPickupMode(m)} />
                  {m === "default" ? t("admin.detail.dialogs.pickup.useDefault") : t("admin.detail.dialogs.pickup.custom")}
                </label>
              ))}
            </fieldset>
            {pickupMode === "default" ? (
              <div className="rounded-card border border-line bg-sand-50 p-3 text-label font-normal text-ink-soft">{settings.location.storeName}<br />{settings.location.addressLine}, {settings.location.city}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField className="sm:col-span-2" label={t("admin.detail.dialogs.pickup.storeName")} value={custom.storeName} onChange={(e) => { setCustom({ ...custom, storeName: e.target.value }); clear("storeName"); }} error={fieldErrors.storeName} />
                <TextField className="sm:col-span-2" label={t("admin.detail.dialogs.pickup.addressLine")} value={custom.addressLine} onChange={(e) => { setCustom({ ...custom, addressLine: e.target.value }); clear("addressLine"); }} error={fieldErrors.addressLine} />
                <TextField label={t("admin.detail.dialogs.pickup.city")} value={custom.city} onChange={(e) => { setCustom({ ...custom, city: e.target.value }); clear("city"); }} error={fieldErrors.city} />
                <TextField label={t("admin.detail.dialogs.pickup.region")} value={custom.region} onChange={(e) => setCustom({ ...custom, region: e.target.value })} />
                <TextField className="sm:col-span-2" label={t("admin.detail.dialogs.pickup.phone")} value={custom.phone} onChange={(e) => setCustom({ ...custom, phone: e.target.value })} />
                <TextAreaField rows={2} optional label={t("admin.detail.dialogs.pickup.additionalFr")} value={custom.fr} onChange={(e) => setCustom({ ...custom, fr: e.target.value })} />
                <TextAreaField rows={2} optional label={t("admin.detail.dialogs.pickup.additionalHt")} value={custom.ht} onChange={(e) => setCustom({ ...custom, ht: e.target.value })} />
              </div>
            )}
            {customerNoteField(noteTemplates.pickupChanged)}{internalField}
          </>
        )}

        {error && <Alert tone="danger" live="assertive">{error}</Alert>}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-line pt-4">
        <Button variant="ghost" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
        <Button type="submit" variant={dangerous ? "danger" : "primary"} loading={busy}>{t(confirmLabel[kind])}</Button>
      </div>
    </form>
  );
}

// Re-export for list/dashboard quick actions
export { locales };
