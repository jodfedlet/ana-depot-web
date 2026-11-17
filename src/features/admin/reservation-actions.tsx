"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ActionError } from "@/components/ui/admin-error";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox, SelectField, TextAreaField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/provider";
import type { AdminReservation } from "@/lib/api/admin/dto";
import { acceptReservation, addReservationNote, cancelReservation, collectReservation, readyReservation, rejectReservation } from "@/lib/api/admin/endpoints";
import { useAction } from "@/lib/api/admin/hooks";
import { announceAdminChange } from "@/lib/api/admin/signals";
import { isTransientError } from "@/lib/api/errors";
import { attemptKey, endAttempt } from "@/lib/api/idempotency";
import { hasPayments } from "@/lib/admin/money";

export type DialogKind = "accept" | "reject" | "ready" | "collect" | "cancel" | "note-customer" | "note-internal";
const REJECT_REASONS = ["PRODUCT_UNAVAILABLE", "INCORRECT_PRODUCT_INFO", "QUANTITY_UNAVAILABLE", "CANNOT_FULFILL", "OTHER"] as const;

/**
 * Every staff action on a reservation. The server decides what is allowed (`allowedActions`) and re-checks every rule; this dialog only collects the inputs.
 * Nothing is reported done before the server answered; a retried action reuses its idempotency key, so it cannot be applied twice. A state that moved under
 * us (409 `invalid_status`) reloads the reservation.
 */
export function ReservationActionDialog({ reservation, kind, onClose, onDone }: { reservation: AdminReservation; kind: DialogKind; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const action = useAction();
  const [reason, setReason] = useState<(typeof REJECT_REASONS)[number]>("PRODUCT_UNAVAILABLE");
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const paid = hasPayments(reservation.balances);
  const needsConfirm = kind === "collect" || kind === "cancel";
  const textRequired = kind === "cancel" || kind.startsWith("note") || (kind === "reject" && reason === "OTHER");
  const textOk = !textRequired || text.trim().length > 0;
  const disabled = (needsConfirm && !confirmed) || !textOk;

  const submit = async () => {
    const payload = { kind, reason, text: text.trim() };
    const scope = `reservation:${reservation.id}:${kind}`;
    const key = attemptKey(scope, payload);
    const o = { idempotencyKey: key };
    const call = () => {
      switch (kind) {
        case "accept": return acceptReservation(reservation.id, o);
        case "reject": return rejectReservation(reservation.id, reason, text.trim() || undefined, o);
        case "ready": return readyReservation(reservation.id, o);
        case "collect": return collectReservation(reservation.id, o);
        case "cancel": return cancelReservation(reservation.id, text.trim(), o);
        case "note-customer": return addReservationNote(reservation.id, "CUSTOMER_VISIBLE", text.trim(), o);
        case "note-internal": return addReservationNote(reservation.id, "INTERNAL", text.trim(), o);
      }
    };
    const r = await action.run(call);
    if (!r.ok) { if (!isTransientError(r.error)) endAttempt(scope); return; }
    endAttempt(scope);
    const done = { accept: "accepted", reject: "rejected", ready: "ready", collect: "collected", cancel: "cancelled", "note-customer": "note", "note-internal": "note" } as const;
    toast.show({ tone: "success", message: t(`admin.detail.toasts.${done[kind]}`) });
    announceAdminChange();
    onDone();
  };

  const title = kind === "note-customer" ? t("admin.detail.dialogs.note.titleCustomer") : kind === "note-internal" ? t("admin.detail.dialogs.note.titleInternal") : t(`admin.detail.dialogs.${kind}.title` as "admin.detail.dialogs.accept.title");
  const body = kind.startsWith("note") ? null : t(`admin.detail.dialogs.${kind as "accept"}.text`);
  const confirmLabel = kind.startsWith("note") ? t("admin.detail.dialogs.note.confirm") : t(`admin.detail.dialogs.${kind as "accept"}.confirm`);
  const danger = kind === "reject" || kind === "cancel";

  return (
    <Drawer open onClose={onClose} title={`${title} — ${reservation.reference}`} side="center"
      footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={onClose} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button variant={danger ? "danger" : "primary"} loading={action.pending} disabled={disabled} onClick={submit}>{confirmLabel}</Button></div>}>
      <div className="space-y-4">
        {body && <p className="text-label font-normal text-ink-soft">{body}</p>}
        {kind === "accept" && <p className="text-caption text-ink-muted">{t("adminRes.acceptNotPaid")}</p>}
        {kind === "reject" && (
          <>
            <SelectField label={t("admin.detail.dialogs.reject.reason")} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>{REJECT_REASONS.map((r) => <option key={r} value={r}>{t(`rejectReasons.${r.toLowerCase() as "other"}`)}</option>)}</SelectField>
            <TextAreaField label={t("admin.detail.dialogs.reject.explanation")} optional={reason !== "OTHER"} rows={3} value={text} onChange={(e) => setText(e.target.value)} hint={reason === "OTHER" ? t("admin.detail.dialogs.reject.explanationRequired") : undefined} />
            <p className="text-caption text-ink-muted">{t("adminRes.rejectNoteInternal")}</p>
          </>
        )}
        {kind === "ready" && <Alert tone="info">{t("adminRes.readyNoHold")}</Alert>}
        {kind === "collect" && (
          <>
            <Alert tone="info">{t("adminRes.collectNeedsPayment")}</Alert>
            <Checkbox label={t("admin.detail.dialogs.collect.confirmHandover")} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <p className="text-caption text-ink-muted">{t("adminRes.collectStock")} {t("adminCommon.irreversible")}</p>
          </>
        )}
        {kind === "cancel" && (
          <>
            {paid && <Alert tone="warning" live="polite" title={t("adminRes.cancelPaidTitle")}>{t("adminRes.cancelPaid")}</Alert>}
            <Alert tone="info">{t("adminRes.cancelEffects")}</Alert>
            <TextAreaField label={t("admin.detail.dialogs.cancel.reason")} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            <Checkbox label={t("admin.detail.dialogs.cancel.check")} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          </>
        )}
        {kind === "note-customer" && <><Alert tone="info">{t("adminRes.customerNoteWarning")}</Alert><TextAreaField label={t("admin.detail.dialogs.customerNote")} rows={4} value={text} onChange={(e) => setText(e.target.value)} hint={t("admin.detail.dialogs.customerNoteHint", { language: t(`admin.detail.dialogs.languageName.${reservation.locale === "ht" ? "ht" : "fr"}`) })} /></>}
        {kind === "note-internal" && <TextAreaField label={t("admin.detail.dialogs.internalNote")} rows={4} value={text} onChange={(e) => setText(e.target.value)} hint={t("admin.detail.dialogs.internalNoteHint")} />}
        {action.error != null && <ActionError error={action.error} onReload={onDone} />}
      </div>
    </Drawer>
  );
}
