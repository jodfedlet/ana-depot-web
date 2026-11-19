"use client";

import { Copy, Download, KeyRound } from "lucide-react";
import { useState } from "react";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useFormat } from "@/i18n/format";
import { useT } from "@/i18n/provider";
import type { RecoveryCodesIssuedDto } from "@/lib/api/admin/dto";
import { generateRecoveryCodes, recoveryCodesStatus } from "@/lib/api/admin/endpoints";
import { useAction, useAdminResource } from "@/lib/api/admin/hooks";
import { apiErrorKey } from "@/lib/api/errors";

/**
 * The signed-in member's OWN second-factor recovery codes (D15). A new set is shown ONCE, in this component's state only: never stored, logged or put in a URL. The backend keeps
 * only hashes, replaces the previous unused codes when a new set is made, and audits every use.
 */
export function SecurityView() {
  const t = useT();
  const fmt = useFormat();
  const toast = useToast();
  const status = useAdminResource("security:recovery", (signal) => recoveryCodesStatus({ signal }));
  const action = useAction();
  const [confirming, setConfirming] = useState(false);
  const [issued, setIssued] = useState<RecoveryCodesIssuedDto | null>(null);

  const generate = async () => {
    const r = await action.run(() => generateRecoveryCodes());
    if (!r.ok) return;
    setConfirming(false);
    setIssued(r.value);
  };
  const text = issued ? issued.codes.join("\n") : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.show({ tone: "success", message: t("adminSecurity.copied") }); } catch { /* the codes stay visible to copy by hand */ }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Ana Dépôt\n${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = "ana-depot-recovery-codes.txt"; a.click();
    URL.revokeObjectURL(url);
  };
  const done = () => { setIssued(null); status.reload(); };

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-body text-ink-soft">{t("adminSecurity.intro")}</p>
      {status.error != null && !status.data ? <AdminErrorState error={status.error} onRetry={status.reload} /> : !status.data ? <Skeleton className="h-24 w-full" /> : (
        <section aria-labelledby="rc-title" className="space-y-3 rounded-card border border-line bg-surface p-5">
          <h2 id="rc-title" className="text-h3 flex items-center gap-2"><KeyRound aria-hidden className="size-4" />{t("adminSecurity.title")}</h2>
          <p className={`text-label ${status.data.remaining > 0 ? "font-normal" : "font-semibold text-warning-fg"}`} data-testid="recovery-status" role="status">
            {status.data.remaining > 0 ? t("adminSecurity.remaining", { count: status.data.remaining }) : t("adminSecurity.none")}
          </p>
          {status.data.generatedAt && <p className="text-caption text-ink-soft">{t("adminSecurity.generatedOn", { date: fmt.date(status.data.generatedAt, "short") })}</p>}
          <Button onClick={() => setConfirming(true)}>{t("adminSecurity.generate")}</Button>
        </section>
      )}

      {confirming && (
        <Drawer open onClose={() => setConfirming(false)} title={t("adminSecurity.regenerateTitle")} side="center"
          footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setConfirming(false)} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button loading={action.pending} onClick={generate}>{t("adminSecurity.confirm")}</Button></div>}>
          <p className="text-label font-normal text-ink-soft">{t("adminSecurity.regenerateText")}</p>
          {action.error != null && <Alert tone="danger" live="assertive" className="mt-3">{t(apiErrorKey(action.error))}</Alert>}
        </Drawer>
      )}
      {issued && (
        <Drawer open onClose={done} title={t("adminSecurity.codesTitle")} side="center" footer={<div className="flex justify-end"><Button onClick={done}>{t("adminSecurity.done")}</Button></div>}>
          <div className="space-y-4">
            <Alert tone="warning">{t("adminSecurity.codesWarning")}</Alert>
            <ul data-testid="recovery-codes" translate="no" className="grid grid-cols-1 gap-2 rounded-card border border-line bg-sand-50 p-4 text-center font-mono text-base font-semibold tracking-wide sm:grid-cols-2">
              {issued.codes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copy}><Copy aria-hidden className="size-4" />{t("adminSecurity.copy")}</Button>
              <Button variant="outline" size="sm" onClick={download}><Download aria-hidden className="size-4" />{t("adminSecurity.download")}</Button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
