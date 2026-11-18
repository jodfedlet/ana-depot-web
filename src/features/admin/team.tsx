"use client";

import { Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { TextField } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useFormat } from "@/i18n/format";
import { useLocale, useT } from "@/i18n/provider";
import { apiErrorKey } from "@/lib/api/errors";
import type { IssuedInvitationDto, StaffInvitationDto, StaffMemberDto } from "@/lib/api/admin/dto";
import { createInvitation, listInvitations, listStaff, revokeInvitation, setStaffActive } from "@/lib/api/admin/endpoints";
import { useAction, useAdminResource } from "@/lib/api/admin/hooks";
import { RefreshButton } from "./common";

const statusTone = { PENDING: "warning", ACCEPTED: "success", REVOKED: "neutral", EXPIRED: "neutral" } as const;

/** The team: who may use the administration, and how a colleague joins (one-time code). Everything is decided by the backend; this only shows and asks. */
export function TeamView() {
  const t = useT();
  const fmt = useFormat();
  const toast = useToast();
  const members = useAdminResource("team:members", (signal) => listStaff({ signal }));
  const invitations = useAdminResource("team:invitations", (signal) => listInvitations({ signal }));
  const action = useAction();
  const [removing, setRemoving] = useState<StaffMemberDto | null>(null);
  const [inviting, setInviting] = useState(false);
  const [history, setHistory] = useState(false);

  const reload = () => { members.reload(); invitations.reload(); };
  const setActive = async (m: StaffMemberDto, active: boolean) => {
    const r = await action.run(() => setStaffActive(m.userId, active));
    if (!r.ok) { toast.show({ tone: "error", message: t(apiErrorKey(r.error)) }); return; }
    toast.show({ tone: "success", message: t(active ? "adminTeam.reactivated" : "adminTeam.deactivated") });
    setRemoving(null);
    reload();
  };
  const revoke = async (i: StaffInvitationDto) => {
    const r = await action.run(() => revokeInvitation(i.id));
    if (!r.ok) { toast.show({ tone: "error", message: t(apiErrorKey(r.error)) }); return; }
    toast.show({ tone: "success", message: t("adminTeam.revoked") });
    invitations.reload();
  };
  // pending invitations are the ones to act on; past ones (accepted, revoked, expired) are history, one click away
  const shownInvitations = (invitations.data ?? []).filter((i) => history || i.status === "PENDING");
  const nameOf = (m: StaffMemberDto) => m.displayName ?? (m.initial ? t("adminTeam.initialAdmin") : (m.note ?? t("adminTeam.unknownName")));

  return (
    <div className="space-y-8">
      <Alert tone="info">{t("adminTeam.rolesNote")}</Alert>

      <section aria-labelledby="team-members" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="team-members" className="text-h3">{t("adminTeam.membersTitle")}</h2>
          <div className="flex gap-2"><RefreshButton onClick={reload} loading={members.loading} /><Button onClick={() => setInviting(true)}><UserPlus aria-hidden className="size-4" />{t("adminTeam.invite")}</Button></div>
        </div>
        {members.error != null && !members.data ? <AdminErrorState error={members.error} onRetry={members.reload} /> : !members.data ? <Skeleton className="h-32 w-full" /> : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface" aria-busy={members.loading}>
            {members.data.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-label font-semibold">{nameOf(m)} {m.you && <Badge tone="brand" className="ml-1">{t("adminTeam.you")}</Badge>}</p>
                  <p className="text-caption text-ink-soft">{[m.email, t("adminTeam.joinedOn", { date: fmt.date(m.joinedAt, "short") })].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={m.active ? "success" : "neutral"}>{t(m.active ? "adminTeam.active" : "adminTeam.inactive")}</Badge>
                  {!m.you && (m.active
                    ? <Button variant="outline" size="sm" onClick={() => setRemoving(m)}>{t("adminTeam.deactivate")}</Button>
                    : <Button variant="outline" size="sm" loading={action.pending} onClick={() => setActive(m, true)}>{t("adminTeam.reactivate")}</Button>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="team-invitations" className="space-y-3">
        <h2 id="team-invitations" className="text-h3">{t("adminTeam.invitationsTitle")}</h2>
        {invitations.error != null && !invitations.data ? <AdminErrorState error={invitations.error} onRetry={invitations.reload} /> : !invitations.data ? <Skeleton className="h-20 w-full" /> : shownInvitations.length === 0 ? (
          <p className="text-label font-normal text-ink-soft">{t("adminTeam.noInvitations")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {shownInvitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0"><p className="text-label font-semibold">{i.note}</p><p className="text-caption text-ink-soft">{t("adminTeam.expiresOn", { date: fmt.date(i.expiresAt, "short") })}</p></div>
                <div className="flex items-center gap-3">
                  <Badge tone={statusTone[i.status]}>{t(`adminTeam.status.${i.status}`)}</Badge>
                  {i.status === "PENDING" && <Button variant="outline" size="sm" loading={action.pending} onClick={() => revoke(i)}>{t("adminTeam.revoke")}</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {invitations.data && invitations.data.some((i) => i.status !== "PENDING") && (
          <Button variant="ghost" size="sm" onClick={() => setHistory((v) => !v)} aria-expanded={history}>{t(history ? "adminTeam.hideHistory" : "adminTeam.showHistory")}</Button>
        )}
      </section>

      {removing && (
        <Drawer open onClose={() => setRemoving(null)} title={t("adminTeam.deactivateTitle", { name: nameOf(removing) })} side="center"
          footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setRemoving(null)} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button variant="danger" loading={action.pending} onClick={() => setActive(removing, false)}>{t("adminTeam.confirmDeactivate")}</Button></div>}>
          <p className="text-label font-normal text-ink-soft">{t("adminTeam.deactivateText")}</p>
        </Drawer>
      )}
      {inviting && <InviteDialog onClose={() => { setInviting(false); invitations.reload(); }} />}
    </div>
  );
}

/** Creates the one-time code and shows it ONCE. The code lives only in this component's state: it is never stored, logged or put in a URL on the way here. */
function InviteDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const locale = useLocale();
  const toast = useToast();
  const action = useAction();
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<IssuedInvitationDto | null>(null);
  const submit = async () => {
    const r = await action.run(() => createInvitation(note.trim()));
    if (r.ok) setIssued(r.value);
  };
  const joinUrl = issued ? `${window.location.origin}/${locale}/account/join-team#code=${issued.code}` : "";
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.show({ tone: "success", message: t("adminTeam.copied") }); } catch { /* the code stays visible to copy by hand */ }
  };
  return (
    <Drawer open onClose={onClose} title={issued ? t("adminTeam.codeTitle") : t("adminTeam.inviteTitle")} side="center"
      footer={issued
        ? <div className="flex justify-end"><Button onClick={onClose}>{t("adminTeam.done")}</Button></div>
        : <div className="flex justify-end gap-3"><Button variant="ghost" onClick={onClose} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button loading={action.pending} disabled={note.trim().length === 0} onClick={submit}>{t("adminTeam.createCode")}</Button></div>}>
      {issued ? (
        <div className="space-y-4">
          <Alert tone="warning">{t("adminTeam.codeWarning")}</Alert>
          <p data-testid="invitation-code" translate="no" className="rounded-card border border-line bg-sand-50 p-4 text-center font-mono text-lg font-semibold tracking-wide sm:text-xl">{issued.code}</p>
          <p className="text-caption text-ink-soft">{t("adminTeam.expiresOn", { date: fmt.date(issued.expiresAt, "short") })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(issued.code)}><Copy aria-hidden className="size-4" />{t("adminTeam.copy")}</Button>
            <Button variant="outline" size="sm" onClick={() => copy(joinUrl)}><Copy aria-hidden className="size-4" />{t("adminTeam.joinLink")}</Button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void submit(); }}>
          <p className="text-label font-normal text-ink-soft">{t("adminTeam.inviteIntro")}</p>
          <TextField label={t("adminTeam.noteLabel")} hint={t("adminTeam.noteHint")} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} autoFocus />
          {action.error != null && <Alert tone="danger" live="assertive">{t(apiErrorKey(action.error))}</Alert>}
        </form>
      )}
    </Drawer>
  );
}
