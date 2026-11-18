"use client";

import { useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import { apiErrorKey } from "@/lib/api/errors";
import { redeemInvitation } from "@/lib/api/staff-invitation";

/**
 * "Join the team": the signed-in person types (or arrives with) the one-time code the store gave them. The code travels in the URL FRAGMENT (`#code=`), which the browser never sends
 * to a server or into an access log; it is removed from the address bar when it is used. The backend decides; a wrong, used or expired code is one and the same message.
 */
const subscribeHash = (onChange: () => void) => { window.addEventListener("hashchange", onChange); return () => window.removeEventListener("hashchange", onChange); };
const codeInHash = () => /(?:^#|&)code=([A-Za-z0-9-]{1,64})/.exec(window.location.hash)?.[1] ?? "";

export function JoinTeam() {
  const t = useT();
  const fromLink = useSyncExternalStore(subscribeHash, codeInHash, () => "");
  const [typed, setTyped] = useState<string | null>(null);
  const code = typed ?? fromLink;
  const setCode = setTyped;
  const [state, setState] = useState<"idle" | "busy" | "joined">("idle");
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    setState("busy");
    setError(null);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);   // the code leaves the address bar as soon as it is used
    try {
      await redeemInvitation(code.trim());
      setCode("");
      setState("joined");
    } catch (e) {
      setError(e);
      setState("idle");
    }
  };

  if (state === "joined") {
    return (
      <div className="max-w-lg space-y-4">
        <Alert tone="success" live="polite">{t("adminTeam.join.success")}</Alert>
        <ButtonLink href="/admin">{t("adminTeam.join.goAdmin")}</ButtonLink>
      </div>
    );
  }
  return (
    <form className="max-w-lg space-y-4" method="post" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void submit(); }}>
      <p className="text-body text-ink-soft">{t("adminTeam.join.intro")}</p>
      <TextField label={t("adminTeam.join.code")} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64} className="font-mono" />
      {error != null && <Alert tone="danger" live="assertive">{t(apiErrorKey(error))}</Alert>}
      <Button type="submit" loading={state === "busy"} disabled={code.trim().length === 0}>{t("adminTeam.join.submit")}</Button>
    </form>
  );
}
