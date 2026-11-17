"use client";

import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ActionError, AdminErrorState } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLText, useT } from "@/i18n/provider";
import type { AdminPosition, AdminProduct, AdminProductSummary } from "@/lib/api/admin/dto";
import { adjustInventory, getProduct, listInventory, listMovements, listProducts, registerInventory, setInventoryThreshold } from "@/lib/api/admin/endpoints";
import { useAction, useAdminResource } from "@/lib/api/admin/hooks";
import { announceAdminChange } from "@/lib/api/admin/signals";
import { isTransientError } from "@/lib/api/errors";
import { attemptKey, endAttempt } from "@/lib/api/idempotency";
import { useUrlState } from "./common";

const STATES = ["OK", "LOW", "OUT", "UNTRACKED"] as const;
const REASONS = ["RECEPTION", "RETURN", "DAMAGE", "LOSS", "CORRECTION", "COUNT", "OTHER"] as const;
const TYPES = ["ADD", "REDUCE", "RECOUNT"] as const;
const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";
const PAGE = 20;
const stateTone = { OK: "success", LOW: "warning", OUT: "danger", UNTRACKED: "neutral" } as const;
const intOf = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

/**
 * Stock positions as the server holds them: on hand, reserved (open reservations) and available = on hand − reserved. One position per product (or variant),
 * SHARED by HTG and USD. Every change is a recorded movement; the page never invents a number and never reports success before the server answered.
 */
export function InventoryView() {
  const t = useT();
  const lt = useLText();
  const url = useUrlState("/admin/inventory");
  const state = url.get("state"), q = url.get("q"), productId = url.get("productId"), sort = url.get("sort");
  const page = Math.max(0, Number(url.get("page")) || 0);
  const res = useAdminResource(`inventory:${state}:${q}:${productId}:${sort}:${page}`, (signal) => listInventory({ state: state || undefined, q: q || undefined, productId: productId || undefined, sort: sort || undefined, page, size: PAGE }, { signal }));
  const missing = useAdminResource("inventory:missing", (signal) => listProducts({ stock: "NO_STOCK_RECORD", size: 10, sort: "UPDATED" }, { signal }));
  const [adjust, setAdjust] = useState<AdminPosition | null>(null);
  const [history, setHistory] = useState<AdminPosition | null>(null);
  const [threshold, setThreshold] = useState<AdminPosition | null>(null);
  const [register, setRegister] = useState<string | null>(null);
  const refresh = () => { res.reload(); missing.reload(); announceAdminChange(); };
  const base = (p: AdminPosition) => lt({ fr: p.productName.fr ?? "", ht: p.productName.ht ?? "" });
  const name = (p: AdminPosition) => `${base(p)}${p.variantSku ? ` · ${p.variantSku}` : ""}`;
  const actions = (p: AdminPosition) => (
    <div className="flex flex-wrap gap-1.5">
      {p.tracked && <Button size="sm" variant="outline" onClick={() => setAdjust(p)}>{t("admin.inventory.adjust")}</Button>}
      {p.tracked && <Button size="sm" variant="ghost" onClick={() => setThreshold(p)}>{t("adminInv.threshold")}</Button>}
      <Button size="sm" variant="ghost" onClick={() => setHistory(p)}>{t("admin.inventory.history")}</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <details className="text-caption text-ink-soft">
        <summary className="text-label min-h-9 cursor-pointer list-none font-normal"><span className="font-semibold text-ink">{t("adminInv.explainShort")}</span> <span className="font-semibold text-brand-700 hover:underline">{t("adminInv.howTo")}</span></summary>
        <p className="mt-1">{t("admin.inventory.explain")} {t("adminInv.shared")}</p>
      </details>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="iq" className="sr-only">{t("admin.inventory.search")}</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="iq" type="search" defaultValue={q} key={q} placeholder={t("admin.inventory.search")} onKeyDown={(e) => { if (e.key === "Enter") url.set({ q: (e.target as HTMLInputElement).value || undefined }); }} onBlur={(e) => { if (e.target.value !== q) url.set({ q: e.target.value || undefined }); }} className={`${field} w-full pl-9`} />
        </div>
        <div><label htmlFor="is" className="text-caption mb-1 block text-ink-muted">{t("admin.inventory.filterLabel")}</label>
          <select id="is" value={state} onChange={(e) => url.set({ state: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("adminInv.states")}</option>{STATES.map((s) => <option key={s} value={s}>{t(`admin.inventory.states.${s.toLowerCase() as "ok"}`)}</option>)}</select></div>
        <div><label htmlFor="iso" className="text-caption mb-1 block text-ink-muted">{t("admin.list.sort")}</label>
          <select id="iso" value={sort} onChange={(e) => url.set({ sort: e.target.value || undefined })} className={`${field} w-full`}><option value="">{t("adminProd.sort.UPDATED")}</option><option value="AVAILABLE_ASC">{t("adminInv.sortAvailable")}</option></select></div>
        {productId && <div className="flex items-end"><Button variant="ghost" onClick={() => url.set({ productId: undefined })}>{t("adminInv.clearProduct")}</Button></div>}
      </div>

      {(missing.data?.items.length ?? 0) > 0 || productId ? (
        <section aria-labelledby="miss-t" className="rounded-card border border-warning-fg/30 bg-warning-bg p-4">
          <h2 id="miss-t" className="text-label font-semibold text-warning-fg">{t("adminInv.missingTitle")}</h2>
          <p className="text-caption mt-1 text-ink-soft">{t("adminInv.missingText")}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {productId && <li><Button size="sm" variant="outline" onClick={() => setRegister(productId)}><Plus aria-hidden className="size-4" />{t("adminInv.registerThis")}</Button></li>}
            {(missing.data?.items ?? []).map((p: AdminProductSummary) => <li key={p.id}><Button size="sm" variant="outline" onClick={() => setRegister(p.id)}><Plus aria-hidden className="size-4" />{lt({ fr: p.name.fr ?? "", ht: p.name.ht ?? "" })}{p.sku ? ` · ${p.sku}` : ""}</Button></li>)}
          </ul>
        </section>
      ) : null}

      {res.error != null && !res.data ? <AdminErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <div role="status" aria-label={t("adminCommon.loading")}><Skeleton className="h-72 w-full" /></div> : res.data.items.length === 0 ? (
        <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Search aria-hidden />} title={t("admin.inventory.emptyTitle")} description={t("admin.inventory.emptyText")} /></div>
      ) : (
        <div aria-busy={res.loading}>
          <p role="status" className="text-label mb-2 font-normal text-ink-soft">{t("adminCommon.results", { count: res.data.totalItems })}</p>
          <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
            <table className="w-full min-w-[52rem] text-left">
              <caption className="sr-only">{t("admin.inventory.title")}</caption>
              <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted"><tr>
                <th scope="col" className="px-3 py-3 font-medium">{t("admin.inventory.columns.product")}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t("admin.inventory.columns.state")}</th>
                {(["onHand", "reserved", "available"] as const).map((c) => <th key={c} scope="col" className="px-3 py-3 text-right font-medium">{t(`admin.inventory.columns.${c}`)}</th>)}
                <th scope="col" className="px-3 py-3 text-right font-medium">{t("adminInv.threshold")}</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">{t("admin.inventory.columns.actions")}</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {res.data.items.map((p) => (
                  <tr key={p.id} className="text-label align-top font-normal hover:bg-sand-50">
                    <th scope="row" className="px-3 py-3 text-left font-normal"><Link href={`/admin/products/${p.productId}`} className="font-semibold hover:underline">{base(p)}</Link><p className="text-caption text-ink-soft">{p.variantSku ?? p.productSku} · {t(`admin.products.statuses.${p.productStatus.toLowerCase() as "draft"}`)}</p></th>
                    <td className="px-3 py-3"><Badge tone={stateTone[p.state]}>{t(`admin.inventory.states.${p.state.toLowerCase() as "ok"}`)}</Badge></td>
                    <td className="px-3 py-3 text-right tabular-nums">{p.onHand ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{p.reserved ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{p.available ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{p.lowStockThreshold ?? "—"}</td>
                    <td className="px-3 py-3 text-right"><div className="flex justify-end">{actions(p)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {res.data.items.map((p) => (
              <li key={p.id} className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><Link href={`/admin/products/${p.productId}`} className="text-label font-semibold hover:underline">{base(p)}</Link><p className="text-caption text-ink-soft">{p.variantSku ?? p.productSku}</p></div>
                  <Badge tone={stateTone[p.state]}>{t(`admin.inventory.states.${p.state.toLowerCase() as "ok"}`)}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-control bg-sand-50 p-2"><dt className="text-caption text-ink-soft">{t("adminInv.onHandShort")}</dt><dd className="font-display text-xl tabular-nums">{p.onHand ?? "—"}</dd></div>
                  <div className="rounded-control bg-sand-50 p-2"><dt className="text-caption text-ink-soft">{t("admin.inventory.columns.reserved")}</dt><dd className="font-display text-xl tabular-nums">{p.reserved ?? "—"}</dd></div>
                  <div className="rounded-control bg-brand-50 p-2"><dt className="text-caption text-ink-soft">{t("admin.inventory.columns.available")}</dt><dd className="font-display text-xl tabular-nums">{p.available ?? "—"}</dd></div>
                </dl>
                <div className="mt-3">{actions(p)}</div>
              </li>
            ))}
          </ul>
          {res.data.totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t("admin.list.pagination")}>
              <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => url.set({ page: String(page - 1) }, true)}>{t("adminCommon.previous")}</Button>
              <span className="text-label font-normal text-ink-soft">{t("adminCommon.page", { page: page + 1, count: res.data.totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= res.data.totalPages} onClick={() => url.set({ page: String(page + 1) }, true)}>{t("adminCommon.next")}</Button>
            </nav>
          )}
        </div>
      )}
      {adjust && <AdjustDialog position={adjust} name={name(adjust)} onClose={() => setAdjust(null)} onDone={() => { setAdjust(null); refresh(); }} />}
      {threshold && <ThresholdDialog position={threshold} name={name(threshold)} onClose={() => setThreshold(null)} onDone={() => { setThreshold(null); refresh(); }} onConflict={() => { setThreshold(null); refresh(); }} />}
      {history && <HistoryDialog position={history} name={name(history)} onClose={() => setHistory(null)} />}
      {register && <RegisterDialog productId={register} onClose={() => setRegister(null)} onDone={() => { setRegister(null); refresh(); }} />}
    </div>
  );
}

function AdjustDialog({ position, name, onClose, onDone }: { position: AdminPosition; name: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const action = useAction();
  const [type, setType] = useState<(typeof TYPES)[number]>("ADD");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("RECEPTION");
  const [note, setNote] = useState("");
  const q = intOf(qty);
  // a PREVIEW only (the server decides, including refusing a result below what is reserved)
  const preview = q === null || position.onHand === null ? null : type === "ADD" ? position.onHand + q : type === "REDUCE" ? position.onHand - q : q;
  const submit = async () => {
    if (q === null) return;
    const body = { type, quantity: q, reason, note: note.trim() || undefined };
    const scope = `stock:${position.id}`;
    const key = attemptKey(scope, body); // the SAME adjustment retried after a lost answer reuses this key: it cannot be applied twice
    const r = await action.run(() => adjustInventory(position.id, body, { idempotencyKey: key }));
    if (!r.ok) { if (!isTransientError(r.error)) endAttempt(scope); return; }
    endAttempt(scope);
    toast.show({ tone: "success", message: t("admin.inventory.toasts.saved") });
    onDone();
  };
  return (
    <Drawer open onClose={onClose} title={`${t("admin.inventory.adjustDialog.title")} — ${name}`} side="center"
      footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={onClose} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button loading={action.pending} disabled={q === null} onClick={submit}>{t("admin.inventory.adjustDialog.confirm")}</Button></div>}>
      <div className="space-y-4">
        <p className="text-label font-normal text-ink-soft">{t("admin.inventory.adjustDialog.current", { onHand: position.onHand ?? 0, reserved: position.reserved ?? 0 })}</p>
        <SelectField label={t("admin.inventory.adjustDialog.type")} value={type} onChange={(e) => setType(e.target.value as typeof type)}>{TYPES.map((x) => <option key={x} value={x}>{t(`admin.inventory.adjustDialog.types.${x.toLowerCase() as "add"}`)}</option>)}</SelectField>
        <TextField label={type === "RECOUNT" ? t("admin.inventory.adjustDialog.newTotal") : t("admin.inventory.adjustDialog.quantity")} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={qty && q === null ? t("admin.inventory.errors.stock_invalid") : undefined} />
        {preview !== null && <p className="text-label font-semibold" role="status">{t("adminInv.previewResult", { count: preview })}</p>}
        <SelectField label={t("admin.inventory.adjustDialog.reason")} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>{REASONS.map((x) => <option key={x} value={x}>{t(`admin.inventory.reasons.${x.toLowerCase() as "other"}`)}</option>)}</SelectField>
        <TextField label={t("admin.inventory.adjustDialog.note")} optional value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-caption text-ink-muted">{t("adminInv.reservedUntouched")}</p>
        {action.error != null && <ActionError error={action.error} onReload={onDone} />}
      </div>
    </Drawer>
  );
}

function ThresholdDialog({ position, name, onClose, onDone, onConflict }: { position: AdminPosition; name: string; onClose: () => void; onDone: () => void; onConflict: () => void }) {
  const t = useT();
  const toast = useToast();
  const action = useAction();
  const [value, setValue] = useState(position.lowStockThreshold === null ? "" : String(position.lowStockThreshold));
  const n = value.trim() === "" ? null : intOf(value);
  const bad = value.trim() !== "" && n === null;
  const submit = async () => {
    const r = await action.run(() => setInventoryThreshold(position.id, position.version, n));
    if (r.ok) { toast.show({ tone: "success", message: t("adminInv.thresholdSaved") }); onDone(); }
  };
  return (
    <Drawer open onClose={onClose} title={`${t("adminInv.threshold")} — ${name}`} side="center"
      footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={onClose} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button loading={action.pending} disabled={bad} onClick={submit}>{t("common.save")}</Button></div>}>
      <div className="space-y-4">
        <p className="text-caption text-ink-soft">{t("adminInv.thresholdHint")}</p>
        <TextField label={t("adminInv.thresholdLabel")} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} error={bad ? t("admin.inventory.errors.stock_invalid") : undefined} />
        {action.error != null && <ActionError error={action.error} onReload={onConflict} />}
      </div>
    </Drawer>
  );
}

function HistoryDialog({ position, name, onClose }: { position: AdminPosition; name: string; onClose: () => void }) {
  const t = useT();
  const fmt = useFormat();
  const [page, setPage] = useState(0);
  const res = useAdminResource(`movements:${position.id}:${page}`, (signal) => listMovements(position.id, { page, size: 10 }, { signal }));
  return (
    <Drawer open onClose={onClose} title={`${t("admin.inventory.historyDialog.title")} — ${name}`} side="center" footer={<div className="flex justify-end"><Button variant="ghost" onClick={onClose}>{t("adminCommon.close")}</Button></div>}>
      {res.error != null && !res.data ? <AdminErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Skeleton className="h-32 w-full" /> : res.data.items.length === 0 ? <p className="text-label font-normal text-ink-soft">{t("admin.inventory.historyDialog.empty")}</p> : (
        <>
          <ul className="divide-y divide-line">
            {res.data.items.map((m) => (
              <li key={m.id} className="py-2.5">
                <p className="text-label font-normal"><span className={m.delta >= 0 ? "font-semibold text-success-fg" : "font-semibold text-danger-fg"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span> → {m.balanceAfter} · {t(`admin.inventory.movementTypes.${m.type.toLowerCase() as "add"}`)} · {t(`admin.inventory.reasons.${m.reason.toLowerCase() as "other"}`)}</p>
                <p className="text-caption text-ink-soft">{fmt.dateTime(m.at)}{m.note ? ` · ${m.note}` : ""}{m.reservationId && <> · <Link href={`/admin/reservations/${m.reservationId}`} className="font-semibold text-brand-700 underline">{t("adminInv.reservation")}</Link></>}</p>
              </li>
            ))}
          </ul>
          {res.data.totalPages > 1 && <div className="mt-3 flex items-center justify-between"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("adminCommon.previous")}</Button><span className="text-caption text-ink-soft">{t("adminCommon.page", { page: page + 1, count: res.data.totalPages })}</span><Button variant="outline" size="sm" disabled={page + 1 >= res.data.totalPages} onClick={() => setPage((p) => p + 1)}>{t("adminCommon.next")}</Button></div>}
        </>
      )}
    </Drawer>
  );
}

function RegisterDialog({ productId, onClose, onDone }: { productId: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const lt = useLText();
  const toast = useToast();
  const action = useAction();
  const res = useAdminResource<AdminProduct>(`stock-product:${productId}`, (signal) => getProduct(productId, { signal }));
  const [variantId, setVariantId] = useState("");
  const [tracked, setTracked] = useState(true);
  const [initial, setInitial] = useState("0");
  const [threshold, setThreshold] = useState("");
  const p = res.data;
  const free = p ? p.variants.filter((v) => !p.stock.positions.some((s) => s.variantId === v.id)) : [];
  const needsVariant = !!p && p.variants.length > 0;
  const n = intOf(initial);
  const th = threshold.trim() === "" ? null : intOf(threshold);
  const bad = n === null || (threshold.trim() !== "" && th === null) || (needsVariant && !variantId);
  const submit = async () => {
    if (!p || n === null) return;
    const body = { productId: p.id, variantId: needsVariant ? variantId : null, tracked, initialOnHand: tracked ? n : 0, lowStockThreshold: tracked ? th : null };
    const scope = `stock-register:${p.id}:${variantId}`;
    const r = await action.run(() => registerInventory(body, { idempotencyKey: attemptKey(scope, body) }));
    if (!r.ok) { if (!isTransientError(r.error)) endAttempt(scope); return; }
    endAttempt(scope);
    toast.show({ tone: "success", message: t("adminInv.registered") });
    onDone();
  };
  return (
    <Drawer open onClose={onClose} title={t("adminInv.registerTitle")} side="center"
      footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={onClose} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button loading={action.pending} disabled={bad || !p} onClick={submit}>{t("adminInv.registerConfirm")}</Button></div>}>
      {res.error != null ? <AdminErrorState error={res.error} onRetry={res.reload} /> : !p ? <Skeleton className="h-32 w-full" /> : (
        <div className="space-y-4">
          <p className="text-label font-semibold">{lt({ fr: p.name.fr ?? "", ht: p.name.ht ?? "" })}</p>
          {needsVariant && (free.length === 0 ? <Alert tone="info">{t("adminInv.allVariantsRegistered")}</Alert> : (
            <SelectField label={t("adminInv.variant")} value={variantId} onChange={(e) => setVariantId(e.target.value)}><option value="">{t("admin.products.form.attributes.select")}</option>{free.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}</SelectField>
          ))}
          <Checkbox label={t("admin.products.form.stock.tracked")} description={t("admin.products.form.stock.trackedHint")} checked={tracked} onChange={(e) => setTracked(e.target.checked)} />
          {tracked && <>
            <TextField label={t("adminInv.initial")} inputMode="numeric" value={initial} onChange={(e) => setInitial(e.target.value)} error={n === null ? t("admin.inventory.errors.stock_invalid") : undefined} />
            <TextField label={t("adminInv.thresholdLabel")} inputMode="numeric" optional hint={t("adminInv.thresholdHint")} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </>}
          {action.error != null && <ActionError error={action.error} onReload={onDone} />}
        </div>
      )}
    </Drawer>
  );
}
