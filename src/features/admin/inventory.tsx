"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLText, useT } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { type StockAdjustment, adjustStock } from "@/lib/api/catalog-admin";
import { type ProductRecord, type StockReason, type VariantRecord, hasVariantsRecord, stockReasons } from "@/lib/catalog/model";
import { stockOf, stockState, type StockState } from "@/lib/catalog/stock";
import { pick } from "@/lib/localized";
import { useLocale } from "@/i18n/provider";
import { useAdminSession } from "@/features/admin/admin-identity";
import { useCatalogState } from "@/lib/stores/catalog-store";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { useReservations } from "@/lib/stores/reservation-store";

interface Row { key: string; product: ProductRecord; variant?: VariantRecord; label: string; sku: string; onHand: number; reserved: number; available: number; state: StockState }
const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";
type AdjType = "add" | "reduce" | "recount";

export function InventoryView() {
  const t = useT();
  const lt = useLText();
  const locale = useLocale();
  const fmt = useFormat();
  const toast = useToast();
  const { session } = useAdminSession();
  const ready = useIsClient();
  const { products, movements } = useCatalogState();
  const reservations = useReservations();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [adjust, setAdjust] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);

  const { rows, untracked } = useMemo(() => {
    const out: Row[] = [];
    const untracked: ProductRecord[] = [];
    for (const p of products) {
      if (!p.inventory.tracked) { if (p.status !== "draft") untracked.push(p); continue; }
      const variantLabel = (v: VariantRecord) => p.options.map((o) => pick(o.values.find((x) => x.id === v.optionValues[o.key])?.label ?? { fr: "", ht: "" }, locale)).filter(Boolean).join(" · ");
      if (hasVariantsRecord(p)) {
        for (const v of p.variants) { const info = stockOf(p, reservations, v.id); out.push({ key: `${p.id}:${v.id}`, product: p, variant: v, label: variantLabel(v), sku: v.sku, onHand: info.onHand, reserved: info.reserved, available: info.available, state: stockState(p, info) }); }
      } else {
        const info = stockOf(p, reservations);
        out.push({ key: p.id, product: p, label: "", sku: p.sku, onHand: info.onHand, reserved: info.reserved, available: info.available, state: stockState(p, info) });
      }
    }
    return { rows: out, untracked };
  }, [products, reservations, locale]);

  if (!ready) return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-11 w-full" /><Skeleton className="mt-4 h-72 w-full" /></div>;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === "all" || r.state === filter) && (!needle || `${lt(r.product.name)} ${r.sku} ${r.label}`.toLowerCase().includes(needle))).sort((a, b) => lt(a.product.name).localeCompare(lt(b.product.name)));
  const lowCount = rows.filter((r) => r.state === "low").length;
  const outCount = rows.filter((r) => r.state === "out").length;
  const stateBadge = (s: StockState) => <Badge tone={s === "ok" ? "success" : s === "low" ? "warning" : "danger"}>{t(`admin.inventory.states.${s === "untracked" ? "untracked" : s}`)}</Badge>;
  const name = (r: Row) => <><span className="font-semibold">{lt(r.product.name)}</span>{r.label && <span className="text-caption block text-ink-soft">{r.label}</span>}</>;

  return (
    <div className="space-y-4">
      <p className="text-caption text-ink-soft">{t("admin.inventory.explain")}</p>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("admin.inventory.filterLabel")}>
        {([["all", t("admin.inventory.filter.all", { count: rows.length })], ["low", t("admin.inventory.filter.low", { count: lowCount })], ["out", t("admin.inventory.filter.out", { count: outCount })]] as const).map(([k, label]) => (
          <Button key={k} size="sm" variant={filter === k ? "primary" : "outline"} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</Button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <label htmlFor="iq" className="sr-only">{t("admin.inventory.search")}</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="iq" type="search" placeholder={t("admin.inventory.search")} value={q} onChange={(e) => setQ(e.target.value)} className={`${field} w-full pl-9`} />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Search aria-hidden />} title={t("admin.inventory.emptyTitle")} description={t("admin.inventory.emptyText")} /></div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
            <table className="w-full min-w-[52rem] text-left">
              <caption className="sr-only">{t("admin.nav.inventory")}</caption>
              <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted"><tr>
                <th scope="col" className="px-3 py-3 font-medium">{t("admin.inventory.columns.product")}</th><th scope="col" className="px-3 py-3 font-medium">SKU</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">{t("admin.inventory.columns.onHand")}</th><th scope="col" className="px-3 py-3 text-right font-medium">{t("admin.inventory.columns.reserved")}</th><th scope="col" className="px-3 py-3 text-right font-medium">{t("admin.inventory.columns.available")}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t("admin.inventory.columns.state")}</th><th scope="col" className="px-3 py-3 font-medium">{t("admin.inventory.columns.actions")}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.key} className="text-label font-normal hover:bg-sand-50">
                    <th scope="row" className="px-3 py-3 font-normal">{name(r)}{r.product.status !== "active" && <Badge className="mt-1">{t(`admin.products.statuses.${r.product.status}`)}</Badge>}</th>
                    <td className="px-3 py-3 text-ink-soft">{r.sku || "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.onHand}</td><td className="px-3 py-3 text-right tabular-nums">{r.reserved}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{r.available}</td>
                    <td className="px-3 py-3">{stateBadge(r.state)}</td>
                    <td className="px-3 py-3"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setAdjust(r)}>{t("admin.inventory.adjust")}<span className="sr-only"> {lt(r.product.name)} {r.label}</span></Button><Button size="sm" variant="ghost" onClick={() => setHistory(r)}>{t("admin.inventory.history")}<span className="sr-only"> {lt(r.product.name)} {r.label}</span></Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {shown.map((r) => (
              <li key={r.key} className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3"><p className="text-label">{name(r)}</p>{stateBadge(r.state)}</div>
                <dl className="text-caption mt-3 grid grid-cols-3 gap-2 text-ink-soft"><div><dt>{t("admin.inventory.columns.onHand")}</dt><dd className="text-label text-ink">{r.onHand}</dd></div><div><dt>{t("admin.inventory.columns.reserved")}</dt><dd className="text-label text-ink">{r.reserved}</dd></div><div><dt>{t("admin.inventory.columns.available")}</dt><dd className="text-label font-semibold text-ink">{r.available}</dd></div></dl>
                <div className="mt-3 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setAdjust(r)}>{t("admin.inventory.adjust")}</Button><Button variant="ghost" className="flex-1" onClick={() => setHistory(r)}>{t("admin.inventory.history")}</Button></div>
              </li>
            ))}
          </ul>
        </>
      )}

      {untracked.length > 0 && (
        <section aria-labelledby="untracked-t" className="rounded-card border border-dashed border-line-strong bg-sand-50 p-4">
          <h2 id="untracked-t" className="text-label font-semibold">{t("admin.inventory.untrackedTitle")}</h2>
          <p className="text-caption mt-1 text-ink-soft">{t("admin.inventory.untrackedText")}</p>
          <ul className="mt-2 flex flex-wrap gap-2">{untracked.map((p) => <li key={p.id}><Link href={`/admin/products/${p.id}`} className="text-caption inline-flex min-h-8 items-center rounded-full bg-surface px-3 font-medium underline">{lt(p.name)}</Link></li>)}</ul>
        </section>
      )}

      <Drawer open={!!adjust} onClose={() => setAdjust(null)} title={t("admin.inventory.adjustDialog.title")} side="center">
        {adjust && <AdjustForm key={adjust.key} row={adjust} onDone={() => { setAdjust(null); toast.show({ tone: "success", message: `${t("admin.inventory.toasts.saved")} ${t("admin.demo.saved")}` }); }} onCancel={() => setAdjust(null)} staff={session?.name ?? "Staff"} />}
      </Drawer>
      <Drawer open={!!history} onClose={() => setHistory(null)} title={t("admin.inventory.historyDialog.title")} side="center" footer={<div className="flex justify-end"><Button onClick={() => setHistory(null)}>{t("common.close")}</Button></div>}>
        {history && (
          <div>
            <p className="text-label font-semibold">{lt(history.product.name)}{history.label ? ` — ${history.label}` : ""}</p>
            {(() => {
              const list = movements.filter((m) => m.productId === history.product.id && m.variantId === history.variant?.id).sort((a, b) => b.at.localeCompare(a.at));
              return list.length === 0 ? <p className="text-label mt-3 font-normal text-ink-soft">{t("admin.inventory.historyDialog.empty")}</p> : (
                <ol className="mt-3 divide-y divide-line">
                  {list.map((m) => (
                    <li key={m.id} className="py-2.5">
                      <p className="text-label flex flex-wrap items-center gap-2 font-normal"><strong className={m.delta >= 0 ? "text-success-fg" : "text-danger-fg"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</strong><span>{t(`admin.inventory.movementTypes.${m.type}`)}</span><span className="text-ink-soft">→ {m.balanceAfter}</span></p>
                      <p className="text-caption text-ink-muted">{fmt.dateTime(m.at)} · {m.by} · {t(`admin.inventory.reasons.${m.reason}`)}{m.note ? ` · ${m.note}` : ""}</p>
                    </li>
                  ))}
                </ol>
              );
            })()}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function AdjustForm({ row, onDone, onCancel, staff }: { row: Row; onDone: () => void; onCancel: () => void; staff: string }) {
  const t = useT();
  const lt = useLText();
  const [type, setType] = useState<AdjType>("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<StockReason>("reception");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const n = Number(qty);
  const valid = qty.trim() !== "" && Number.isInteger(n) && n >= (type === "recount" ? 0 : 1);
  const result = valid ? (type === "add" ? row.onHand + n : type === "reduce" ? row.onHand - n : n) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) { setError(t("admin.inventory.errors.stock_invalid")); return; }
    setBusy(true); setError(undefined);
    const adj: StockAdjustment = { productId: row.product.id, variantId: row.variant?.id, type, quantity: n, reason, note };
    const r = await adjustStock(adj, staff);
    setBusy(false);
    if (!r.ok) { setError(t(`admin.inventory.errors.${r.error === "stock_negative" ? "stock_negative" : "stock_invalid"}`)); return; }
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-label font-semibold">{lt(row.product.name)}{row.label ? ` — ${row.label}` : ""}</p>
      <p className="text-label font-normal text-ink-soft">{t("admin.inventory.adjustDialog.current", { onHand: row.onHand, reserved: row.reserved })}</p>
      <SelectField label={t("admin.inventory.adjustDialog.type")} value={type} onChange={(e) => { setType(e.target.value as AdjType); setReason(e.target.value === "recount" ? "count" : e.target.value === "reduce" ? "damage" : "reception"); }}>
        {(["add", "reduce", "recount"] as const).map((k) => <option key={k} value={k}>{t(`admin.inventory.adjustDialog.types.${k}`)}</option>)}
      </SelectField>
      <TextField label={type === "recount" ? t("admin.inventory.adjustDialog.newTotal") : t("admin.inventory.adjustDialog.quantity")} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} error={error && !valid ? error : undefined} />
      {result !== null && <p role="status" className="text-label font-semibold">{t("admin.inventory.adjustDialog.result", { count: result })}</p>}
      <SelectField label={t("admin.inventory.adjustDialog.reason")} value={reason} onChange={(e) => setReason(e.target.value as StockReason)}>
        {stockReasons.map((k) => <option key={k} value={k}>{t(`admin.inventory.reasons.${k}`)}</option>)}
      </SelectField>
      <TextAreaField label={t("admin.inventory.adjustDialog.note")} optional rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && valid && <Alert tone="danger" live="assertive">{error}</Alert>}
      <div className="flex justify-end gap-3 border-t border-line pt-4"><Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{t("common.cancel")}</Button><Button type="submit" loading={busy}>{t("admin.inventory.adjustDialog.confirm")}</Button></div>
    </form>
  );
}
export type { MessageKey };
