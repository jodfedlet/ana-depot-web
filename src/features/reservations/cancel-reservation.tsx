"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { TextAreaField } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import { apiErrorKey } from "@/lib/api/errors";
import { cancelReservation } from "@/lib/api/public";

const MAX = 300;

/**
 * D7 (owner-approved): the customer may cancel while the store has not started preparing the order. WHETHER they may is the backend's answer (`canCancel`); this only asks for a reason,
 * sends it, and reloads the reservation from the server's reply. Nothing is shown as cancelled before the server says so.
 */
export function CancelReservation({ reference, phone, onDone }: { reference: string; phone: string; onDone: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const trimmed = reason.trim();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelReservation(reference, phone, trimmed);
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>{t("track.cancel.button")}</Button>
      {open && (
        <Drawer open onClose={() => !busy && setOpen(false)} title={t("track.cancel.title")} side="center"
          footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>{t("track.cancel.keep")}</Button><Button variant="danger" loading={busy} disabled={trimmed.length === 0} onClick={submit}>{t("track.cancel.confirm")}</Button></div>}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (trimmed) void submit(); }}>
            <p className="text-label font-normal text-ink-soft">{t("track.cancel.text")}</p>
            <TextAreaField label={t("track.cancel.reason")} hint={t("track.cancel.reasonHint")} value={reason} maxLength={MAX} onChange={(e) => setReason(e.target.value)} autoFocus />
            {error != null && <Alert tone="danger" live="assertive">{t(apiErrorKey(error))}</Alert>}
          </form>
        </Drawer>
      )}
    </>
  );
}
