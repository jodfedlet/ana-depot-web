"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { apiErrorKey } from "@/lib/api/errors";
import type { NotificationDto, NotificationStatusDto, NotificationTypeDto } from "@/lib/api/admin/dto";
import { useAdminSession } from "./admin-identity";
import { listNotifications, notificationSummary, retryNotification } from "@/lib/api/admin/endpoints";
import { useAction, useAdminResource } from "@/lib/api/admin/hooks";
import { RefreshButton, useUrlState } from "./common";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";
export const STATUSES: NotificationStatusDto[] = ["PENDING", "RETRY", "SENT", "DEAD", "CAPTURED", "SKIPPED_NO_RECIPIENT", "SKIPPED_INVALID_RECIPIENT", "SKIPPED_THROTTLED", "SUPERSEDED", "EXPIRED"];
export const TYPES: NotificationTypeDto[] = ["RESERVATION_SUBMITTED", "RESERVATION_CONFIRMED", "RESERVATION_REJECTED", "RESERVATION_READY_FOR_PICKUP", "RESERVATION_COLLECTED", "RESERVATION_CANCELLED",
  "RESERVATION_EXPIRED", "PAYMENT_RECEIVED", "PAYMENT_FAILED", "CHECKOUT_EXPIRED"];
const tone: Record<NotificationStatusDto, Tone> = { PENDING: "warning", PROCESSING: "info", RETRY: "warning", SENT: "success", DEAD: "danger", CAPTURED: "neutral", SKIPPED_NO_RECIPIENT: "neutral",
  SKIPPED_INVALID_RECIPIENT: "neutral", SKIPPED_THROTTLED: "neutral", SUPERSEDED: "neutral", EXPIRED: "warning" };

export function NotificationBadge({ status }: { status: NotificationStatusDto }) {
  const t = useT();
  return <Badge tone={tone[status]}>{t(`adminNotif.status.${status}`)}</Badge>;
}

/** The failure as a sentence a shop owner understands (the API sends only a short code; an unknown code is shown generically, never as raw text). */
export function useProblemText() {
  const t = useT();
  const known = new Set(["smtp_unavailable", "smtp_timeout", "smtp_auth_failed", "smtp_error", "recipient_rejected", "recipient_invalid", "state_changed", "stale", "data_missing", "payment_not_found",
    "render_failed", "mail_build_failed", "internal_error", "capture_failed"]);
  return (code: string | null) => (code ? t(`adminNotif.problem.${known.has(code) ? (code as "stale") : "other"}`) : "");
}

/** Customer e-mails: what was sent, what is waiting, what failed, and the one action allowed (resend a message that gave up). */
export function NotificationsView() {
  const t = useT();
  const fmt = useFormat();
  const toast = useToast();
  const problem = useProblemText();
  const url = useUrlState("/admin/notifications");
  const status = url.get("status"), type = url.get("type"), page = Math.max(0, Number(url.get("page")) || 0);
  const summary = useAdminResource("notif:summary", (signal) => notificationSummary({ signal }));
  const list = useAdminResource(`notif:${status}:${type}:${page}`, (signal) => listNotifications({ status: status || undefined, type: type || undefined, page, size: 20 }, { signal }));
  const action = useAction();
  const { can } = useAdminSession();
  const [confirm, setConfirm] = useState<NotificationDto | null>(null);
  const reload = () => { summary.reload(); list.reload(); };

  const retry = async (n: NotificationDto) => {
    const r = await action.run(() => retryNotification(n.id));
    if (!r.ok) { toast.show({ tone: "error", message: t(apiErrorKey(r.error)) }); return; }
    toast.show({ tone: "success", message: t("adminNotif.retried") });
    setConfirm(null);
    reload();
  };

  const counts = summary.data?.counts ?? {};
  const sum = (...k: string[]) => k.reduce((a, c) => a + (counts[c] ?? 0), 0);
  const tiles: { key: "waiting" | "sent" | "failed" | "expired" | "skipped" | "captured"; value: number; filter: string }[] = [
    { key: "waiting", value: sum("PENDING", "RETRY", "PROCESSING"), filter: "PENDING" },
    { key: "sent", value: sum("SENT"), filter: "SENT" },
    { key: "failed", value: sum("DEAD"), filter: "DEAD" },
    ...(sum("EXPIRED") > 0 ? [{ key: "expired" as const, value: sum("EXPIRED"), filter: "EXPIRED" }] : []),
    { key: "skipped", value: sum("SKIPPED_NO_RECIPIENT", "SKIPPED_INVALID_RECIPIENT", "SKIPPED_THROTTLED"), filter: "SKIPPED_NO_RECIPIENT" },
    ...(sum("CAPTURED") > 0 ? [{ key: "captured" as const, value: sum("CAPTURED"), filter: "CAPTURED" }] : []),
  ];

  return (
    <div className="space-y-4">
      {summary.data && summary.data.mode !== "SMTP" && <Alert tone="warning" live="polite">{t(`adminNotif.mode.${summary.data.mode}`)}</Alert>}
      {summary.data ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t("adminNotif.title")}>
          {tiles.map((x) => (
            <li key={x.key}>
              <button type="button" onClick={() => url.set({ status: x.filter })} className={`w-full rounded-card border p-4 text-left hover:bg-sand-50 ${x.key === "failed" && x.value > 0 ? "border-danger-fg bg-danger-bg/40" : "border-line bg-surface"}`}>
                <span className="text-caption block text-ink-muted">{t(`adminNotif.summary.${x.key}`)}</span>
                <span className="text-h2 tabular-nums">{x.value}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : summary.error != null ? <AdminErrorState error={summary.error} onRetry={summary.reload} /> : <Skeleton className="h-20 w-full" />}

      <form onSubmit={(e) => e.preventDefault()} className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-3">
        <div><label htmlFor="nstatus" className="text-caption mb-1 block text-ink-muted">{t("adminNotif.filterStatus")}</label>
          <select id="nstatus" value={status} onChange={(e) => url.set({ status: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("adminNotif.all")}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`adminNotif.status.${s}`)}</option>)}</select></div>
        <div><label htmlFor="ntype" className="text-caption mb-1 block text-ink-muted">{t("adminNotif.filterType")}</label>
          <select id="ntype" value={type} onChange={(e) => url.set({ type: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("adminNotif.all")}</option>{TYPES.map((s) => <option key={s} value={s}>{t(`adminNotif.type.${s}`)}</option>)}</select></div>
        <div className="flex items-end"><RefreshButton onClick={reload} loading={list.loading} /></div>
      </form>

      {list.error != null && !list.data ? <AdminErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Skeleton className="h-64 w-full" /> : list.data.items.length === 0 ? (
        <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Mail aria-hidden />} title={t("adminNotif.emptyTitle")} description={t("adminNotif.emptyText")} /></div>
      ) : (
        <>
          <p role="status" className="text-label font-normal text-ink-soft">{t("adminNotif.count", { count: list.data.totalItems })}</p>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface" aria-busy={list.loading}>
            {list.data.items.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-label font-semibold">{t(`adminNotif.type.${n.type}`)}
                    {n.reservationReference && <> · <Link href={`/admin/reservations/${n.reservationReference}`} className="hover:underline" translate="no">{n.reservationReference}</Link></>}</p>
                  <p className="text-caption text-ink-soft"><span translate="no">{n.recipient ?? t("adminNotif.noRecipient")}</span> · {fmt.dateTime(n.createdAt)}{n.sentAt && <> · {t("adminNotif.columns.sent")} {fmt.dateTime(n.sentAt)}</>}</p>
                  {n.lastError && <p className="text-caption text-danger-fg">{problem(n.lastError)}</p>}
                  {n.status === "RETRY" && n.nextAttemptAt && <p className="text-caption text-ink-muted">{t("adminNotif.nextTry", { date: fmt.dateTime(n.nextAttemptAt) })}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-caption text-ink-muted">{t("adminNotif.columns.attempts")} : {n.attempts}</span>
                  <NotificationBadge status={n.status} />
                  {(n.status === "DEAD" || n.status === "EXPIRED") && can("NOTIFICATIONS_RESEND") && <Button variant="outline" size="sm" onClick={() => setConfirm(n)}>{t("adminNotif.retry")}</Button>}
                </div>
              </li>
            ))}
          </ul>
          {list.data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => url.set({ page: String(page - 1) }, true)}>←</Button>
              <span className="text-caption text-ink-soft">{page + 1} / {list.data.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= list.data.totalPages} onClick={() => url.set({ page: String(page + 1) }, true)}>→</Button>
            </div>
          )}
        </>
      )}

      {confirm && (
        <Drawer open onClose={() => setConfirm(null)} title={t("adminNotif.retryTitle")} side="center"
          footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setConfirm(null)} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button loading={action.pending} onClick={() => retry(confirm)}>{t("adminNotif.retryConfirm")}</Button></div>}>
          <p className="text-label font-normal text-ink-soft">{t("adminNotif.retryText")}</p>
          <p className="text-label mt-3 font-semibold">{t(`adminNotif.type.${confirm.type}`)} · <span translate="no">{confirm.reservationReference}</span></p>
        </Drawer>
      )}
    </div>
  );
}

/** The messages of ONE reservation (on its detail page): what the customer was told, and whether it left. */
export function ReservationMessages({ reservationId }: { reservationId: string }) {
  const t = useT();
  const fmt = useFormat();
  const problem = useProblemText();
  const res = useAdminResource(`notif:res:${reservationId}`, (signal) => listNotifications({ reservationId, size: 50 }, { signal }));
  if (res.error != null && !res.data) return <AdminErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Skeleton className="h-16 w-full" />;
  if (res.data.items.length === 0) return <p className="text-label font-normal text-ink-soft">{t("adminNotif.onReservationNone")}</p>;
  return (
    <ul className="divide-y divide-line">
      {res.data.items.map((n) => (
        <li key={n.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0"><p className="text-label font-semibold">{t(`adminNotif.type.${n.type}`)}</p>
            <p className="text-caption text-ink-soft"><span translate="no">{n.recipient ?? t("adminNotif.noRecipient")}</span> · {fmt.dateTime(n.sentAt ?? n.createdAt)}</p>
            {n.lastError && <p className="text-caption text-danger-fg">{problem(n.lastError)}</p>}</div>
          <NotificationBadge status={n.status} />
        </li>
      ))}
    </ul>
  );
}

/** Dashboard hint: only shown when customers are not getting their messages (failures, or sending switched off). It never blocks the dashboard. */
export function NotificationsAlert() {
  const t = useT();
  const res = useAdminResource("notif:alert", (signal) => notificationSummary({ signal }));
  if (!res.data) return null;
  const dead = res.data.attention;   // gave up, or an important message that expired unsent (superseded and informational-expired messages are not failures)
  if (res.data.mode === "DISABLED") return <Alert tone="warning" live="polite">{t("adminNotif.alertDisabled")} <Link href="/admin/notifications" className="font-semibold underline">{t("adminNotif.open")}</Link></Alert>;
  if (dead > 0) return <Alert tone="danger" live="polite">{t("adminNotif.alertFailed", { count: dead })} <Link href={`/admin/notifications?status=${(res.data.counts.DEAD ?? 0) > 0 ? "DEAD" : "EXPIRED"}`} className="font-semibold underline">{t("adminNotif.open")}</Link></Alert>;
  return null;
}
