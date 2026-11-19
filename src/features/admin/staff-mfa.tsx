"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/states";
import { useT } from "@/i18n/provider";
import { useApiResource } from "@/lib/api/use-resource";
import { apiErrorKey } from "@/lib/api/errors";
import { redeemRecoveryCode } from "@/lib/api/staff-recovery";
import { getBrowserClient } from "@/lib/auth/supabase-browser";

type Step =
  | { kind: "start" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string };

/**
 * Second factor for staff (Supabase Auth TOTP, browser-side with the PUBLIC key only). The backend decides whether it is required (`/me.mfaRequired`) and only trusts the signed
 * `aal2` claim it finds in the access token after the factor was verified; nothing here grants access. After a successful verification the page reloads so the server asks again.
 */
export function StaffMfa() {
  const t = useT();
  const factors = useApiResource("mfa:factors", async (): Promise<Step> => {
    const auth = getBrowserClient()?.auth;
    if (!auth) throw new Error("auth_not_configured");
    const { data, error } = await auth.mfa.listFactors();
    if (error) throw error;
    const verified = data.totp.find((f) => f.status === "verified");
    return verified ? { kind: "verify", factorId: verified.id } : { kind: "start" };
  });
  const [enrolling, setEnrolling] = useState<Step | null>(null);
  const [enrollFailed, setEnrollFailed] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryError, setRecoveryError] = useState<unknown>(null);
  const step: Step | undefined = enrolling ?? factors.data;

  const start = async () => {
    const auth = getBrowserClient()?.auth;
    if (!auth) return;
    setBusy(true);
    // a half-finished earlier enrolment would block a new one: remove it first
    const { data: existing } = await auth.mfa.listFactors();
    for (const f of existing?.all ?? []) if (f.status === "unverified") await auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await auth.mfa.enroll({ factorType: "totp", friendlyName: `Ana Dépôt ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) { setEnrollFailed(true); return; }
    setEnrollFailed(false);
    setEnrolling({ kind: "enroll", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const verify = async (factorId: string) => {
    const auth = getBrowserClient()?.auth;
    if (!auth) return;
    setBusy(true);
    setFailed(false);
    const { error } = await auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
    if (error) { setBusy(false); setFailed(true); return; }
    window.location.reload();
  };

  // a lost authenticator (D15): one recovery code lets THIS sign-in session in for a few hours; the backend checks it and the code works once
  const recover = async () => {
    setBusy(true);
    setRecoveryError(null);
    try {
      await redeemRecoveryCode(recoveryCode.trim());
      window.location.reload();
    } catch (e) {
      setRecoveryError(e);
      setBusy(false);
    }
  };

  if (recovering) {
    return (
      <div className="space-y-4">
        <h1 className="text-h2">{t("adminTeam.mfa.title")}</h1>
        <form className="space-y-4" method="post" onSubmit={(e) => { e.preventDefault(); if (recoveryCode.trim()) void recover(); }}>
          <p className="text-label font-normal text-ink-soft">{t("adminTeam.mfa.recoveryIntro")}</p>
          <TextField label={t("adminTeam.mfa.recoveryCode")} value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64} className="font-mono" />
          {recoveryError != null && <Alert tone="danger" live="assertive">{t(apiErrorKey(recoveryError))}</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy} disabled={recoveryCode.trim().length === 0}>{t("adminTeam.mfa.recoverySubmit")}</Button>
            <Button type="button" variant="ghost" onClick={() => setRecovering(false)}>{t("adminTeam.mfa.recoveryBack")}</Button>
          </div>
          <p className="text-caption text-ink-soft">{t("adminTeam.mfa.recoveryHelp")}</p>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-h2">{t("adminTeam.mfa.title")}</h1>
      {!step && factors.error == null && <Skeleton className="h-32 w-full" />}
      {(factors.error != null || enrollFailed) && (<><Alert tone="danger" live="assertive">{t("adminTeam.mfa.loadError")}</Alert><Button onClick={() => { setEnrollFailed(false); factors.reload(); }}>{t("adminTeam.mfa.retry")}</Button></>)}
      {step?.kind === "start" && !enrollFailed && (<><p className="text-label font-normal text-ink-soft">{t("adminTeam.mfa.intro")}</p><Button loading={busy} onClick={start}>{t("adminTeam.mfa.start")}</Button></>)}
      {(step?.kind === "enroll" || step?.kind === "verify") && (
        <form className="space-y-4" method="post" onSubmit={(e) => { e.preventDefault(); void verify(step.factorId); }}>
          {step.kind === "enroll" ? (
            <>
              <p className="text-label font-normal text-ink-soft">{t("adminTeam.mfa.enrollIntro")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- an inline data: SVG QR code generated by Supabase */}
              <img src={step.qr} alt={t("adminTeam.mfa.qrAlt")} width={176} height={176} className="rounded-control border border-line bg-white p-2" />
              <p className="text-caption text-ink-soft">{t("adminTeam.mfa.secretLabel")}: <span translate="no" className="font-mono break-all select-all">{step.secret}</span></p>
            </>
          ) : <p className="text-label font-normal text-ink-soft">{t("adminTeam.mfa.verifyIntro")}</p>}
          <TextField label={t("adminTeam.mfa.code")} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} pattern="[0-9 ]*" />
          {failed && <Alert tone="danger" live="assertive">{t("adminTeam.mfa.error")}</Alert>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy} disabled={code.replace(/\s/g, "").length !== 6}>{t("adminTeam.mfa.verify")}</Button>
            {step.kind === "verify" && <Button type="button" variant="ghost" onClick={() => setRecovering(true)}>{t("adminTeam.mfa.lostDevice")}</Button>}
          </div>
        </form>
      )}
    </div>
  );
}
