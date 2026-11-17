"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ActionError, AdminErrorState } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useFormat } from "@/i18n/format";
import { useT } from "@/i18n/provider";
import type { AdminPayment, AdminReservation } from "@/lib/api/admin/dto";
import { adjustPayments, getLedger, getReconciliation, getReservationPayments, recordPayment, reversePayment } from "@/lib/api/admin/endpoints";
import { useAction, useAdminResource } from "@/lib/api/admin/hooks";
import { announceAdminChange } from "@/lib/api/admin/signals";
import { isTransientError } from "@/lib/api/errors";
import { attemptKey, endAttempt } from "@/lib/api/idempotency";
import { isOverpaid } from "@/lib/admin/money";
import { PaymentStatusBadge } from "@/features/reservations/shared";
import { useMoneyText } from "./common";

type Dialog = { kind: "record" } | { kind: "reverse"; payment: AdminPayment } | { kind: "adjust" } | null;
const lower = <T extends string>(s: T) => s.toLowerCase() as Lowercase<T>;

/**
 * Money side of ONE reservation, straight from the payment/ledger APIs: balances per currency (a payment settles only its own currency, nothing is converted),
 * the payments, the append-only ledger and the server's reconciliation. Recording, reversing and adjusting use REQUIRED idempotency keys that are reused when a
 * request is retried after a lost answer (never a fresh key). The over-payment policy is undecided: the server's behaviour is shown, not a rule invented here.
 */
export function PaymentPanel({ reservation, onChanged }: { reservation: AdminReservation; onChanged: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const money = useMoneyText();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showLedger, setShowLedger] = useState(false);
  const id = reservation.id;
  const pay = useAdminResource(`res-payments:${id}:${reservation.paymentStatus}`, (signal) => getReservationPayments(id, { signal }));
  const rec = useAdminResource(`res-recon:${id}:${reservation.paymentStatus}`, (signal) => getReconciliation(id, { signal }));
  const ledger = useAdminResource(showLedger ? `res-ledger:${id}:${reservation.paymentStatus}` : null, (signal) => getLedger(id, { signal }));
  const open = reservation.status === "READY_FOR_PICKUP";
  const done = () => { setDialog(null); pay.reload(); rec.reload(); ledger.reload(); announceAdminChange(); onChanged(); };

  if (pay.error != null && !pay.data) return <AdminErrorState error={pay.error} onRetry={pay.reload} />;
  if (!pay.data) return <Skeleton className="h-40 w-full" />;
  const { balances, payments, paymentStatus } = pay.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><PaymentStatusBadge status={lower(paymentStatus)} /><span className="text-caption text-ink-soft">{t("paymentMethod.cash_at_pickup")}</span>
        {rec.data && <Badge tone={rec.data.consistent ? "success" : "danger"}>{rec.data.consistent ? t("adminRes.reconciled") : t("adminRes.notReconciled")}</Badge>}</div>

      <ul className="divide-y divide-line rounded-control border border-line">
        {balances.map((b) => (
          <li key={b.currency} className="px-3 py-2.5">
            <p className="text-label font-semibold">{b.currency}{isOverpaid(b) && <Badge tone="warning" className="ml-2">{t("adminRes.overpaid")}</Badge>}</p>
            <dl className="text-label mt-1 grid grid-cols-[1fr_auto] gap-y-0.5 font-normal">
              <dt className="text-ink-soft">{t("admin.detail.labels.total")}</dt><dd className="text-right tabular-nums">{money(b.total, b.currency)}</dd>
              <dt className="text-ink-soft">{t("admin.detail.labels.paid")}</dt><dd className="text-right tabular-nums">{money(b.paid, b.currency)}</dd>
              <dt className="text-ink-soft">{t("admin.detail.labels.due")}</dt><dd className="text-right font-semibold tabular-nums">{money(b.due, b.currency)}</dd>
            </dl>
          </li>
        ))}
      </ul>
      {balances.some(isOverpaid) && <Alert tone="warning">{t("adminRes.overpaidNote")}</Alert>}

      {open ? <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setDialog({ kind: "record" })}>{t("admin.detail.actions.recordPayment")}</Button><Button variant="ghost" onClick={() => setDialog({ kind: "adjust" })}>{t("adminRes.adjust")}</Button></div> : <p className="text-caption text-ink-muted">{t("adminRes.paymentsOnlyReady")}</p>}

      {payments.length > 0 && (
        <ul className="divide-y divide-line rounded-control border border-line">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={`text-label ${p.reversed ? "font-normal text-ink-muted line-through" : "font-semibold"}`}>{money(p.amount, p.currency)}</p>
                <p className="text-caption text-ink-soft">{fmt.dateTime(p.receivedAt)}{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</p>
                {p.reversed && p.reversal && <p className="text-caption text-danger-fg">{t("adminRes.reversedOn", { date: fmt.dateTime(p.reversal.at), reason: p.reversal.reason })}</p>}
              </div>
              {p.reversed ? <Badge tone="danger">{t("adminRes.reversed")}</Badge> : open && <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "reverse", payment: p })}><RotateCcw aria-hidden className="size-4" />{t("adminRes.reverse")}</Button>}
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button variant="ghost" size="sm" onClick={() => setShowLedger((v) => !v)} aria-expanded={showLedger}>{showLedger ? t("adminRes.hideLedger") : t("adminRes.showLedger")}</Button>
        {showLedger && (ledger.error != null && !ledger.data ? <AdminErrorState error={ledger.error} onRetry={ledger.reload} /> : !ledger.data ? <Skeleton className="mt-2 h-20 w-full" /> : (
          <div className="mt-2 overflow-x-auto"><table className="text-caption w-full min-w-[28rem] text-left">
            <caption className="sr-only">{t("adminRes.ledger")}</caption>
            <thead className="text-ink-muted"><tr><th scope="col" className="py-1 font-medium">{t("adminRes.ledgerDate")}</th><th scope="col" className="py-1 font-medium">{t("adminRes.ledgerType")}</th><th scope="col" className="py-1 text-right font-medium">{t("adminRes.ledgerAmount")}</th><th scope="col" className="py-1 pl-3 font-medium">{t("adminRes.reason")}</th></tr></thead>
            <tbody className="divide-y divide-line">{ledger.data.map((e) => <tr key={e.id}><td className="py-1.5">{fmt.dateTime(e.at)}</td><td className="py-1.5">{t(`adminRes.ledgerTypes.${e.type}`)}</td><td className="py-1.5 text-right tabular-nums">{e.amount.startsWith("-") ? `−${money(e.amount.slice(1), e.currency)}` : money(e.amount, e.currency)}</td><td className="py-1.5 pl-3 text-ink-soft">{e.reason ?? "—"}</td></tr>)}</tbody>
          </table></div>
        ))}
      </div>

      {dialog?.kind === "record" && <RecordDialog reservation={reservation} balances={balances} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "reverse" && <ReverseDialog payment={dialog.payment} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "adjust" && <AdjustDialog reservation={reservation} balances={balances} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

function RecordDialog({ reservation, balances, onClose, onDone }: { reservation: AdminReservation; balances: AdminReservation["balances"]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const money = useMoneyText();
  const action = useAction();
  const open = balances.filter((b) => b.due !== "0.00");
  const [currency, setCurrency] = useState((open[0] ?? balances[0])?.currency ?? "HTG");
  const bal = balances.find((b) => b.currency === currency);
  const [amount, setAmount] = useState(bal?.due ?? "");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const submit = async () => {
    const body = { amount: amount.trim().replace(",", "."), currency, method: "CASH_AT_PICKUP", reference: ref.trim() || undefined, note: note.trim() || undefined };
    const scope = `payment:${reservation.id}`;
    const key = attemptKey(scope, body); // a retry after a lost answer reuses THIS key: the server can only return the first payment
    const r = await action.run(() => recordPayment(reservation.id, body, { idempotencyKey: key }));
    if (!r.ok) { if (!isTransientError(r.error)) endAttempt(scope); return; }
    endAttempt(scope);
    toast.show({ tone: "success", message: t("admin.detail.toasts.payment") });
    onDone();
  };
  return (
    <Drawer open onClose={onClose} title={`${t("admin.detail.dialogs.payment.title")} — ${reservation.reference}`} side="center"
      footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={onClose} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button loading={action.pending} disabled={!amount.trim()} onClick={submit}>{t("admin.detail.dialogs.payment.confirm")}</Button></div>}>
      <div className="space-y-4">
        <p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.payment.text")}</p>
        <SelectField label={t("admin.detail.dialogs.payment.currency")} value={currency} onChange={(e) => { setCurrency(e.target.value); setAmount(balances.find((b) => b.currency === e.target.value)?.due ?? ""); }} hint={t("admin.detail.dialogs.payment.currencyHint")}>{balances.map((b) => <option key={b.currency} value={b.currency}>{b.currency}</option>)}</SelectField>
        {bal && <p className="text-label font-normal text-ink-soft">{t("admin.detail.dialogs.payment.due", { amount: money(bal.due, bal.currency) })}</p>}
        <TextField label={t("admin.detail.dialogs.payment.amount", { currency })} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label={t("admin.detail.dialogs.payment.reference")} optional value={ref} onChange={(e) => setRef(e.target.value)} />
        <TextField label={t("adminRes.paymentNote")} optional value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-caption text-ink-muted">{t("adminRes.overpaidNote")}</p>
        {action.error != null && <ActionError error={action.error} onReload={onDone} />}
      </div>
    </Drawer>
  );
}

function ReverseDialog({ payment, onClose, onDone }: { payment: AdminPayment; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const money = useMoneyText();
  const action = useAction();
  const [reason, setReason] = useState("");
  const submit = async () => {
    const scope = `payment-reversal:${payment.id}`;
    const key = attemptKey(scope, { reason: reason.trim() });
    const r = await action.run(() => reversePayment(payment.id, reason.trim(), { idempotencyKey: key }));
    if (!r.ok) { if (!isTransientError(r.error)) endAttempt(scope); return; }
    endAttempt(scope);
    toast.show({ tone: "success", message: t("adminRes.reversedToast") });
    onDone();
  };
  return (
    <Drawer open onClose={onClose} title={t("adminRes.reverseTitle")} side="center"
      footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={onClose} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button variant="danger" loading={action.pending} disabled={!reason.trim()} onClick={submit}>{t("adminRes.reverse")}</Button></div>}>
      <div className="space-y-4">
        <p className="text-label font-normal text-ink-soft">{t("adminRes.reverseText", { amount: money(payment.amount, payment.currency) })}</p>
        <TextAreaField label={t("adminRes.reason")} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {action.error != null && <ActionError error={action.error} onReload={onDone} />}
      </div>
    </Drawer>
  );
}

function AdjustDialog({ reservation, balances, onClose, onDone }: { reservation: AdminReservation; balances: AdminReservation["balances"]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const action = useAction();
  const [currency, setCurrency] = useState(balances[0]?.currency ?? "HTG");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const submit = async () => {
    const body = { amount: amount.trim().replace(",", "."), currency, reason: reason.trim() };
    const scope = `payment-adjust:${reservation.id}`;
    const key = attemptKey(scope, body);
    const r = await action.run(() => adjustPayments(reservation.id, body, { idempotencyKey: key }));
    if (!r.ok) { if (!isTransientError(r.error)) endAttempt(scope); return; }
    endAttempt(scope);
    toast.show({ tone: "success", message: t("adminRes.adjustedToast") });
    onDone();
  };
  return (
    <Drawer open onClose={onClose} title={t("adminRes.adjustTitle")} side="center"
      footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={onClose} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button loading={action.pending} disabled={!amount.trim() || !reason.trim()} onClick={submit}>{t("adminRes.adjust")}</Button></div>}>
      <div className="space-y-4">
        <Alert tone="warning">{t("adminRes.adjustText")}</Alert>
        <SelectField label={t("admin.detail.dialogs.payment.currency")} value={currency} onChange={(e) => setCurrency(e.target.value)}>{balances.map((b) => <option key={b.currency} value={b.currency}>{b.currency}</option>)}</SelectField>
        <TextField label={t("adminRes.adjustAmount", { currency })} inputMode="decimal" value={amount} hint={t("adminRes.adjustHint")} onChange={(e) => setAmount(e.target.value)} />
        <TextAreaField label={t("adminRes.reason")} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {action.error != null && <ActionError error={action.error} onReload={onDone} />}
      </div>
    </Drawer>
  );
}
