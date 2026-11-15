"use client";

import { History, Save, Undo2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Alert, DemoNotice } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { PickupInfo } from "@/features/reservations/shared";
import { countryOptions } from "@/config/market";
import { useFormat } from "@/i18n/format";
import { type Locale, locales } from "@/i18n/config";
import { useT } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { savePickupSettings } from "@/lib/api/reservations";
import { cn } from "@/lib/cn";
import type { LText } from "@/lib/localized";
import { type DaySchedule, type PickupInstructions, type PickupLocation, type PickupSettings, pickupAvailability } from "@/lib/pickup/types";
import { type PickupErrors, changedGroups, validatePickupSettings } from "@/lib/pickup/validate";
import { useAdminSession } from "@/features/admin/admin-identity";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { usePickup } from "@/lib/stores/pickup-store";
import { focusFirstInvalid } from "@/lib/validation";
import { useUnsavedChanges } from "./admin-shell";

function Card({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-5">
      <h2 id={id} className="text-h3 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** One textarea per launch language: customers see the text in the language they chose. */
function BilingualField({ label, value, onChange, optional, hint }: { label: string; value: LText; onChange: (v: LText) => void; optional?: boolean; hint?: string }) {
  const t = useT();
  return (
    <fieldset>
      <legend className="text-label mb-1.5 flex w-full justify-between"><span>{label}</span>{optional && <span className="text-caption font-normal text-ink-muted">{t("common.optional")}</span>}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {locales.map((l) => (
          <TextAreaField key={l} lang={l} rows={3} label={t(`admin.pickupSettings.instructions.${l}`)} value={value[l]} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />
        ))}
      </div>
      {hint && <p className="text-caption mt-1.5 text-ink-muted">{hint}</p>}
    </fieldset>
  );
}

/** Wrapper: remounts the form with fresh state whenever saved settings change. */
export function PickupSettingsPage() {
  const t = useT();
  const ready = useIsClient();
  const { settings } = usePickup();
  if (!ready) return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-8 w-64" /><Skeleton className="mt-6 h-96 w-full" /></div>;
  return <PickupSettingsForm key={settings.updatedAt} settings={settings} />;
}

function PickupSettingsForm({ settings }: { settings: PickupSettings }) {
  const t = useT();
  const fmt = useFormat();
  const toast = useToast();
  const { session } = useAdminSession();
  const { history } = usePickup();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<PickupSettings>(settings);
  const [errors, setErrors] = useState<PickupErrors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [previewLocale, setPreviewLocale] = useState<Locale>("fr");

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  useUnsavedChanges(dirty);
  const changes = changedGroups(settings, draft);
  const availability = pickupAvailability(draft);

  const setLoc = (patch: Partial<PickupLocation>) => setDraft((d) => ({ ...d, location: { ...d.location, ...patch } }));
  const setInstr = (key: keyof PickupInstructions, v: LText) => setDraft((d) => ({ ...d, instructions: { ...d.instructions, [key]: v } }));
  const setDay = (i: number, patch: Partial<DaySchedule>) => setDraft((d) => ({ ...d, location: { ...d.location, schedule: d.location.schedule.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } }));
  const err = (k: keyof PickupErrors) => (errors[k] ? t(errors[k] as MessageKey) : undefined);
  const clearErr = (k: keyof PickupErrors) => setErrors((e) => ({ ...e, [k]: undefined }));

  const requestSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) { toast.show({ tone: "info", message: t("admin.pickupSettings.noChanges") }); return; }
    const found = validatePickupSettings(draft);
    setErrors(found);
    if (Object.keys(found).length) { window.setTimeout(() => focusFirstInvalid(formRef.current)); return; }
    setSaveError(undefined);
    setConfirmOpen(true);
  };

  const confirmSave = async () => {
    setSaving(true);
    const result = await savePickupSettings(draft, session?.name ?? "Staff");
    setSaving(false);
    if (!result.ok) { setSaveError(t(`serviceErrors.${result.error}`)); return; }
    setConfirmOpen(false);
    toast.show({ tone: "success", message: t("admin.pickupSettings.saved") });
  };

  const groupLabel = (g: string) => t(`admin.pickupSettings.history.groups.${g as "address"}`);

  return (
    <form ref={formRef} onSubmit={requestSave} noValidate className="pb-24">
      <Alert tone="info" className="mb-6">{t("admin.pickupSettings.scope")}</Alert>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card id="av" title={t("admin.pickupSettings.availability.title")}>
            <Checkbox label={t("admin.pickupSettings.availability.enabled")} description={t("admin.pickupSettings.availability.enabledHint")} checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} />
            <Alert tone={availability === "available" ? "success" : "warning"} live="polite">{availability === "available" ? t("admin.pickupSettings.availability.nowAvailable") : availability === "disabled" ? t("admin.pickupSettings.availability.nowDisabled") : t("admin.pickupSettings.availability.nowIncomplete")}</Alert>
            <BilingualField label={t("admin.pickupSettings.availability.unavailableMessage")} value={draft.unavailableMessage} onChange={(v) => setDraft((d) => ({ ...d, unavailableMessage: v }))} />
          </Card>

          <Card id="loc" title={t("admin.pickupSettings.location.title")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField className="sm:col-span-2" label={t("admin.pickupSettings.location.storeName")} value={draft.location.storeName} onChange={(e) => { setLoc({ storeName: e.target.value }); clearErr("storeName"); }} error={err("storeName")} />
              <TextField className="sm:col-span-2" label={t("admin.pickupSettings.location.addressLine")} autoComplete="off" value={draft.location.addressLine} onChange={(e) => { setLoc({ addressLine: e.target.value }); clearErr("addressLine"); }} error={err("addressLine")} />
              <TextField label={t("admin.pickupSettings.location.city")} value={draft.location.city} onChange={(e) => { setLoc({ city: e.target.value }); clearErr("city"); }} error={err("city")} />
              <TextField label={t("admin.pickupSettings.location.region")} value={draft.location.region} onChange={(e) => { setLoc({ region: e.target.value }); clearErr("region"); }} error={err("region")} />
              <SelectField label={t("admin.pickupSettings.location.country")} hint={t("admin.pickupSettings.location.countryHint")} value={draft.location.country} onChange={(e) => { setLoc({ country: e.target.value }); clearErr("country"); }} error={err("country")}>
                {countryOptions.map((c) => <option key={c.code} value={c.code}>{t(`countries.${c.code}`)}</option>)}
              </SelectField>
              <TextField optional label={t("admin.pickupSettings.location.postalCode")} value={draft.location.postalCode ?? ""} onChange={(e) => setLoc({ postalCode: e.target.value || undefined })} />
            </div>
            <BilingualField optional label={t("admin.pickupSettings.location.additional")} value={draft.location.additionalLocationInfo} onChange={(v) => setLoc({ additionalLocationInfo: v })} />
          </Card>

          <Card id="ct" title={t("admin.pickupSettings.contact.title")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t("admin.pickupSettings.contact.phone")} type="tel" value={draft.location.phone} onChange={(e) => { setLoc({ phone: e.target.value }); clearErr("phone"); }} error={err("phone")} />
              <TextField optional label={t("admin.pickupSettings.contact.email")} type="email" value={draft.location.email ?? ""} onChange={(e) => { setLoc({ email: e.target.value || undefined }); clearErr("email"); }} error={err("email")} />
            </div>
          </Card>

          <Card id="sc" title={t("admin.pickupSettings.schedule.title")}>
            {errors.schedule && <p role="alert" className="text-caption font-medium text-danger-fg">{err("schedule")}</p>}
            {errors.scheduleHours && <p role="alert" className="text-caption font-medium text-danger-fg">{err("scheduleHours")}</p>}
            <ul className="divide-y divide-line">
              {draft.location.schedule.map((d, i) => (
                <li key={d.day} className="grid grid-cols-2 items-center gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[10rem_1fr_auto_auto]">
                  <Checkbox className="col-span-2 sm:col-span-1" label={t(`pickup.days.${d.day}`)} checked={d.open} onChange={(e) => { setDay(i, { open: e.target.checked }); clearErr("schedule"); clearErr("scheduleHours"); }} />
                  <span className={cn("hidden sm:block text-caption", d.open ? "text-ink-muted" : "text-ink-muted")}>{d.open ? t("admin.pickupSettings.schedule.open") : t("admin.pickupSettings.schedule.closed")}</span>
                  <div className="min-w-0"><label className="sr-only" htmlFor={`from-${d.day}`}>{t("admin.pickupSettings.schedule.from")} — {t(`pickup.days.${d.day}`)}</label><input id={`from-${d.day}`} type="time" disabled={!d.open} value={d.from} onChange={(e) => setDay(i, { from: e.target.value })} aria-invalid={errors.scheduleHours && d.open && d.from >= d.to ? true : undefined} className="text-label min-h-11 w-full rounded-control border border-line-strong bg-surface px-2 disabled:bg-sand-50 disabled:text-ink-muted" /></div>
                  <div className="min-w-0"><label className="sr-only" htmlFor={`to-${d.day}`}>{t("admin.pickupSettings.schedule.to")} — {t(`pickup.days.${d.day}`)}</label><input id={`to-${d.day}`} type="time" disabled={!d.open} value={d.to} onChange={(e) => setDay(i, { to: e.target.value })} aria-invalid={errors.scheduleHours && d.open && d.from >= d.to ? true : undefined} className="text-label min-h-11 w-full rounded-control border border-line-strong bg-surface px-2 disabled:bg-sand-50 disabled:text-ink-muted" /></div>
                </li>
              ))}
            </ul>
            <BilingualField optional label={t("admin.pickupSettings.schedule.closure")} hint={t("admin.pickupSettings.schedule.closureHint")} value={draft.location.closureInfo} onChange={(v) => setLoc({ closureInfo: v })} />
          </Card>

          <Card id="in" title={t("admin.pickupSettings.instructions.title")}>
            <p className="text-caption -mt-2 text-ink-soft">{t("admin.pickupSettings.instructions.hint")}</p>
            <BilingualField label={t("admin.pickupSettings.instructions.general")} value={draft.instructions.general} onChange={(v) => setInstr("general", v)} />
            <BilingualField label={t("admin.pickupSettings.instructions.contact")} value={draft.instructions.contact} onChange={(v) => setInstr("contact", v)} />
            <BilingualField label={t("admin.pickupSettings.instructions.accepted")} value={draft.instructions.accepted} onChange={(v) => setInstr("accepted", v)} />
            <BilingualField label={t("admin.pickupSettings.instructions.ready")} value={draft.instructions.ready} onChange={(v) => setInstr("ready", v)} />
            <BilingualField optional label={t("admin.pickupSettings.instructions.policy")} hint={t("admin.pickupSettings.instructions.policyHint")} value={draft.instructions.policy} onChange={(v) => setInstr("policy", v)} />
          </Card>

          <Card id="hd" title={t("admin.pickupSettings.hold.title")}>
            <TextField label={t("admin.pickupSettings.hold.label")} hint={t("admin.pickupSettings.hold.hint")} inputMode="numeric" value={draft.holdPeriodDays === null ? "" : String(draft.holdPeriodDays)} onChange={(e) => { const v = e.target.value.trim(); setDraft((d) => ({ ...d, holdPeriodDays: v === "" ? null : Number(v) })); clearErr("holdPeriodDays"); }} error={err("holdPeriodDays")} />
          </Card>
        </div>

        <div className="space-y-6">
          <section aria-labelledby="pv" className="rounded-card border border-line bg-surface p-5 xl:sticky xl:top-20">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="pv" className="text-h3">{t("admin.pickupSettings.preview.title")}</h2>
              <div role="group" aria-label={t("admin.pickupSettings.preview.language")} className="inline-flex rounded-full border border-line-strong p-0.5">
                {locales.map((l) => <button key={l} type="button" lang={l} aria-pressed={previewLocale === l} onClick={() => setPreviewLocale(l)} className={cn("text-caption min-h-8 rounded-full px-3 font-semibold", previewLocale === l ? "bg-brand-700 text-white" : "text-ink-soft hover:bg-sand-100")}>{l.toUpperCase()}</button>)}
              </div>
            </div>
            <PickupInfo location={draft.location} instructions={draft.instructions} status="ready_for_pickup" localeOverride={previewLocale} />
          </section>

          <section aria-labelledby="hs" className="rounded-card border border-line bg-surface p-5">
            <h2 id="hs" className="text-h3 mb-4 flex items-center gap-2"><History aria-hidden className="size-4" />{t("admin.pickupSettings.history.title")}</h2>
            {history.length === 0 ? <p className="text-label font-normal text-ink-soft">{t("admin.pickupSettings.history.empty")}</p> : (
              <ol className="space-y-4">
                {history.map((h) => (
                  <li key={h.id} className="border-l-2 border-line pl-3">
                    <p className="text-label font-semibold">{t("admin.pickupSettings.history.entry", { name: h.by, date: fmt.dateTime(h.at) })}</p>
                    <p className="mt-1 flex flex-wrap gap-1.5">{h.changed.map((g) => <Badge key={g}>{groupLabel(g)}</Badge>)}</p>
                    {h.changed.includes("address") && (
                      <dl className="text-caption mt-2 space-y-1 text-ink-soft">
                        <div><dt className="inline font-semibold">{t("admin.pickupSettings.history.before")}: </dt><dd className="inline">{h.before.location.addressLine}, {h.before.location.city}</dd></div>
                        <div><dt className="inline font-semibold">{t("admin.pickupSettings.history.after")}: </dt><dd className="inline">{h.after.location.addressLine}, {h.after.location.city}</dd></div>
                      </dl>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <DemoNotice>{t("admin.demo.saved")}</DemoNotice>
        </div>
      </div>

      {/* Unsaved changes bar */}
      {dirty && (
        <div role="region" aria-label={t("admin.pickupSettings.unsaved.bar")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-float backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-label font-semibold text-warning-fg">{t("admin.pickupSettings.unsaved.bar")}</p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => { setDraft(settings); setErrors({}); }}><Undo2 aria-hidden className="size-4" />{t("admin.pickupSettings.unsaved.discard")}</Button>
              <Button type="submit"><Save aria-hidden className="size-4" />{t("common.save")}</Button>
            </div>
          </div>
        </div>
      )}

      <Drawer open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)} title={t("admin.pickupSettings.confirm.title")} side="center"
        footer={<div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={saving}>{t("common.cancel")}</Button><Button type="button" loading={saving} onClick={confirmSave}>{t("admin.pickupSettings.confirm.confirm")}</Button></div>}>
        <p className="text-label font-normal text-ink-soft">{t("admin.pickupSettings.confirm.text")}</p>
        <h3 className="text-label mt-4 font-semibold">{t("admin.pickupSettings.confirm.changes")}</h3>
        <ul className="text-label mt-1 list-disc space-y-1 pl-5 font-normal">{changes.map((g) => <li key={g}>{groupLabel(g)}</li>)}</ul>
        {settings.enabled && !draft.enabled && <Alert tone="danger" className="mt-4" live="polite">{t("admin.pickupSettings.confirm.disabling")}</Alert>}
        {saveError && <Alert tone="danger" live="assertive" className="mt-4">{saveError}</Alert>}
      </Drawer>
    </form>
  );
}
