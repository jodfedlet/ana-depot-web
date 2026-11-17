"use client";

import { ArrowDown, ArrowUp, ImagePlus, Plus, Star, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { ActionError } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import Image from "@/components/ui/smart-image";
import { useLText, useT } from "@/i18n/provider";
import { apiErrorKey, fieldErrorKey, problemOf } from "@/lib/api/errors";
import type { AdminAttribute, AdminImage, AdminProduct } from "@/lib/api/admin/dto";
import { deleteImage, orderImages } from "@/lib/api/admin/endpoints";
import { useAction } from "@/lib/api/admin/hooks";
import { ALLOWED_IMAGE_TYPES, uploadProductImage } from "@/lib/api/admin/upload";
import { PLACEHOLDER_IMAGE, safeImageUrl } from "@/lib/api/map-catalog";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { type Currency, type ProductForm, type VariantForm, UNITS, emptyTier, emptyVariant, missingCombinations, productAttributesOf } from "@/lib/admin/product-form";

export type Problems = Record<string, string>;
export type SetForm = (fn: (f: ProductForm) => ProductForm) => void;
const msg = (t: ReturnType<typeof useT>, problems: Problems, path: string) => (problems[path] ? t(fieldErrorKey(problems[path])) : undefined);

export function Section({ id, title, hint, children, badge }: { id: string; title: string; hint?: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-24 rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1"><h2 id={`${id}-t`} className="text-h3">{title}</h2>{hint && <p className="text-caption mt-0.5 text-ink-soft">{hint}</p>}</div>
        {badge}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** The currencies switched on, in the order they are sent: the server's field paths (`prices[0].retail`) index into this list. */
export const enabledCurrencies = (f: ProductForm): Currency[] => SUPPORTED_CURRENCIES.filter((c) => f.prices[c].enabled);

// ---------------- prices ----------------
export function PricesEditor({ form, setForm, problems }: { form: ProductForm; setForm: SetForm; problems: Problems }) {
  const t = useT();
  const set = (c: Currency, patch: Partial<ProductForm["prices"][Currency]>) => setForm((f) => ({ ...f, prices: { ...f.prices, [c]: { ...f.prices[c], ...patch } } }));
  const enabled = enabledCurrencies(form);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label={t("admin.products.form.pricing.unit")} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as ProductForm["unit"] }))}>
          {UNITS.map((u) => <option key={u} value={u}>{t(`units.${u.toLowerCase() as "unit"}`, { count: 1 })}</option>)}
        </SelectField>
        <TextField label={t("admin.products.form.pricing.unitNoteFr")} lang="fr" optional value={form.unitNoteFr} onChange={(e) => setForm((f) => ({ ...f, unitNoteFr: e.target.value }))} />
        <TextField label={t("admin.products.form.pricing.unitNoteHt")} lang="ht" optional value={form.unitNoteHt} onChange={(e) => setForm((f) => ({ ...f, unitNoteHt: e.target.value }))} />
      </div>
      <Alert tone="info">{t("admin.products.form.pricing.intro")} {t("admin.products.form.pricing.sharedStock")}</Alert>
      {msg(t, problems, "prices") && <p role="alert" className="text-caption font-medium text-danger-fg">{msg(t, problems, "prices")}</p>}
      {SUPPORTED_CURRENCIES.map((c) => {
        const p = form.prices[c];
        const i = enabled.indexOf(c);
        const e = (field: string) => (i >= 0 ? msg(t, problems, `prices[${i}].${field}`) : undefined);
        return (
          <fieldset key={c} className="space-y-4 rounded-card border border-line p-4">
            <legend className="text-label px-1 font-semibold">{c}</legend>
            <Checkbox label={t("admin.products.form.pricing.sellIn", { currency: c })} description={t("admin.products.form.pricing.sellInHint", { currency: c })} checked={p.enabled} onChange={(ev) => set(c, { enabled: ev.target.checked })} />
            {p.enabled && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField label={t("admin.products.form.pricing.retail", { currency: c })} inputMode="decimal" value={p.retail} hint={t("admin.products.form.pricing.retailHint")} onChange={(ev) => set(c, { retail: ev.target.value })} error={e("retail")} />
                  <TextField label={t("admin.products.form.pricing.sale", { currency: c })} inputMode="decimal" optional value={p.sale} hint={t("admin.products.form.pricing.saleHint")} onChange={(ev) => set(c, { sale: ev.target.value })} error={e("sale")} />
                  <TextField label={t("admin.products.form.pricing.minOrderIn", { currency: c })} inputMode="numeric" optional value={p.minOrderQty} hint={t("admin.products.form.pricing.minOrderHint")} onChange={(ev) => set(c, { minOrderQty: ev.target.value })} error={e("minOrderQuantity")} />
                </div>
                <Checkbox label={t("admin.products.form.wholesale.toggle")} description={t("admin.products.form.wholesale.toggleHint")} checked={p.wholesaleEnabled} onChange={(ev) => set(c, { wholesaleEnabled: ev.target.checked, tiers: ev.target.checked && p.tiers.length === 0 ? [emptyTier()] : p.tiers })} />
                {p.wholesaleEnabled && (
                  <div>
                    <p className="text-label mb-2 font-semibold">{t("admin.products.form.wholesale.tierTitle")}</p>
                    <ul className="space-y-2">
                      {p.tiers.map((tier, j) => (
                        <li key={tier.uid} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                          <TextField label={t("admin.products.form.wholesale.tierMin")} inputMode="numeric" value={tier.minQty} onChange={(ev) => set(c, { tiers: p.tiers.map((x, n) => (n === j ? { ...x, minQty: ev.target.value } : x)) })} error={e(`tiers[${j}].minQuantity`)} />
                          <TextField label={t("admin.products.form.wholesale.tierPrice", { currency: c })} inputMode="decimal" value={tier.unitPrice} onChange={(ev) => set(c, { tiers: p.tiers.map((x, n) => (n === j ? { ...x, unitPrice: ev.target.value } : x)) })} error={e(`tiers[${j}].unitPrice`)} />
                          <Button variant="ghost" size="sm" className="mb-1" onClick={() => set(c, { tiers: p.tiers.filter((_, n) => n !== j) })} aria-label={t("admin.products.form.wholesale.remove")}><Trash2 aria-hidden className="size-4" /></Button>
                        </li>
                      ))}
                    </ul>
                    {e("tiers") && <p role="alert" className="text-caption mt-1 font-medium text-danger-fg">{e("tiers")}</p>}
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => set(c, { tiers: [...p.tiers, emptyTier()] })}><Plus aria-hidden className="size-4" />{t("admin.products.form.wholesale.add")}</Button>
                  </div>
                )}
              </>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

// ---------------- attributes ----------------
export function AttributesFields({ attrs, form, setForm, problems }: { attrs: AdminAttribute[]; form: ProductForm; setForm: SetForm; problems: Problems }) {
  const t = useT();
  const lt = useLText();
  const set = (id: string, patch: Partial<ProductForm["attributes"][string]>) => setForm((f) => ({ ...f, attributes: { ...f.attributes, [id]: { ...{ optionId: "", text: "", number: "" }, ...f.attributes[id], ...patch } } }));
  if (attrs.length === 0) return <p className="text-label font-normal text-ink-soft">{t("admin.products.form.attributes.none")}</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {attrs.map((a, i) => {
        const v = form.attributes[a.id] ?? { optionId: "", text: "", number: "" };
        const label = `${lt({ fr: a.label.fr ?? "", ht: a.label.ht ?? "" }) || a.key}${a.required ? " *" : ""}`;
        const err = msg(t, problems, `attributes[${i}]`) ?? msg(t, problems, `attributes.${a.id}`);
        if (a.type === "CHOICE") {
          return <SelectField key={a.id} label={label} value={v.optionId} onChange={(e) => set(a.id, { optionId: e.target.value })} error={err}><option value="">{t("admin.products.form.attributes.select")}</option>{a.options.filter((o) => o.active || o.id === v.optionId).map((o) => <option key={o.id} value={o.id}>{lt({ fr: o.label.fr ?? "", ht: o.label.ht ?? "" }) || o.code}</option>)}</SelectField>;
        }
        if (a.type === "NUMBER") return <TextField key={a.id} label={`${label}${a.unit ? ` (${a.unit})` : ""}`} inputMode="decimal" value={v.number} onChange={(e) => set(a.id, { number: e.target.value })} error={err} />;
        return <TextField key={a.id} label={label} value={v.text} onChange={(e) => set(a.id, { text: e.target.value })} error={err} />;
      })}
    </div>
  );
}
export { productAttributesOf };

// ---------------- variants ----------------
export function VariantsEditor({ form, setForm, axes, problems }: { form: ProductForm; setForm: SetForm; axes: AdminAttribute[]; problems: Problems }) {
  const t = useT();
  const lt = useLText();
  const enabled = enabledCurrencies(form);
  const setVariant = (i: number, patch: Partial<VariantForm>) => setForm((f) => ({ ...f, variants: f.variants.map((v, n) => (n === i ? { ...v, ...patch } : v)) }));
  if (axes.length === 0) return <Alert tone="info">{t("adminProd.noAxes")}</Alert>;
  const missing = missingCombinations(axes, form.variants, form.sku);
  return (
    <div className="space-y-4">
      <p className="text-caption text-ink-soft">{t("adminProd.axesHint", { axes: axes.map((a) => lt({ fr: a.label.fr ?? "", ht: a.label.ht ?? "" }) || a.key).join(", ") })}</p>
      {form.variants.length === 0 && <p className="text-label font-normal text-ink-soft">{t("admin.products.form.variants.none")}</p>}
      <ul className="space-y-3">
        {form.variants.map((v, i) => (
          <li key={v.uid} className="space-y-3 rounded-card border border-line p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {axes.map((a) => (
                <SelectField key={a.id} label={lt({ fr: a.label.fr ?? "", ht: a.label.ht ?? "" }) || a.key} value={v.axisValues[a.id] ?? ""} onChange={(e) => setVariant(i, { axisValues: { ...v.axisValues, [a.id]: e.target.value } })} error={msg(t, problems, `variants[${i}].axisValues`)}>
                  <option value="">{t("admin.products.form.attributes.select")}</option>
                  {a.options.filter((o) => o.active || o.id === v.axisValues[a.id]).map((o) => <option key={o.id} value={o.id}>{lt({ fr: o.label.fr ?? "", ht: o.label.ht ?? "" }) || o.code}</option>)}
                </SelectField>
              ))}
              <TextField label={t("adminProd.variantSku")} value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} error={msg(t, problems, `variants[${i}].sku`)} />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {enabled.map((c) => <TextField key={c} label={t("admin.products.form.variants.col.priceIn", { currency: c })} inputMode="decimal" className="w-44" value={v.overrides[c]} onChange={(e) => setVariant(i, { overrides: { ...v.overrides, [c]: e.target.value } })} error={msg(t, problems, `variants[${i}].retailOverrides`)} />)}
              <Checkbox label={t("adminCat.itemActive")} checked={v.active} onChange={(e) => setVariant(i, { active: e.target.checked })} />
              {v.id === undefined && <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((_, n) => n !== i) }))} aria-label={t("adminProd.removeVariant")}><Trash2 aria-hidden className="size-4" /></Button>}
            </div>
            {v.id !== undefined && <p className="text-caption text-ink-muted">{t("adminProd.variantSavedHint")}</p>}
          </li>
        ))}
      </ul>
      <p className="text-caption text-ink-muted">{t("admin.products.form.variants.priceHint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setForm((f) => ({ ...f, variants: [...f.variants, emptyVariant()] }))}><Plus aria-hidden className="size-4" />{t("adminProd.addVariant")}</Button>
        {missing.length > 0 && <Button variant="outline" onClick={() => setForm((f) => ({ ...f, variants: [...f.variants, ...missing] }))}>{t("adminProd.generateMissing", { count: missing.length })}</Button>}
      </div>
    </div>
  );
}

// ---------------- images ----------------
interface Pending { id: string; name: string; progress: number; error?: unknown }

export function ImagesPanel({ product, onChanged }: { product: AdminProduct; onChanged: () => void }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [confirm, setConfirm] = useState<AdminImage | null>(null);
  const action = useAction();
  const images = [...product.images].sort((a, b) => a.position - b.position);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const id = `${file.name}-${file.size}-${Date.now()}`;
      setPending((p) => [...p, { id, name: file.name, progress: 0 }]);
      try {
        await uploadProductImage(product.id, file, (fraction) => setPending((p) => p.map((x) => (x.id === id ? { ...x, progress: fraction } : x))));
        setPending((p) => p.filter((x) => x.id !== id));
        onChanged();
      } catch (error) {
        setPending((p) => p.map((x) => (x.id === id ? { ...x, error } : x)));
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const move = async (i: number, d: -1 | 1) => {
    const ids = images.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    const r = await action.run(() => orderImages(product.id, ids));
    if (r.ok) onChanged();
  };
  const remove = async () => {
    if (!confirm) return;
    const r = await action.run(() => deleteImage(product.id, confirm.id));
    if (r.ok) { setConfirm(null); onChanged(); }
  };

  return (
    <div className="space-y-4">
      <p className="text-caption text-ink-soft">{t("admin.products.form.images.hint")} {t("adminProd.imagesNote")}</p>
      {images.length === 0 && pending.length === 0 && <p className="text-label font-normal text-ink-soft">{t("admin.products.form.images.none")}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img, i) => (
          <li key={img.id} className="rounded-card border border-line p-2">
            <div className="relative aspect-square overflow-hidden rounded-control bg-sand-100"><Image src={safeImageUrl(img.url) ?? PLACEHOLDER_IMAGE} alt="" fill sizes="220px" className="object-cover" />{i === 0 && <Badge tone="brand" className="absolute left-2 top-2"><Star aria-hidden className="mr-1 size-3" />{t("admin.products.form.images.primary")}</Badge>}</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" disabled={i === 0 || action.pending} onClick={() => move(i, -1)} aria-label={t("admin.products.form.images.moveUp")}><ArrowUp aria-hidden className="size-4" /></Button>
                <Button variant="ghost" size="sm" disabled={i === images.length - 1 || action.pending} onClick={() => move(i, 1)} aria-label={t("admin.products.form.images.moveDown")}><ArrowDown aria-hidden className="size-4" /></Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { action.clear(); setConfirm(img); }} aria-label={t("admin.products.form.images.remove")}><Trash2 aria-hidden className="size-4" /></Button>
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.id} className="rounded-card border border-dashed border-line-strong p-3" role="status">
            <p className="text-label truncate font-semibold">{p.name}</p>
            {p.error == null ? (
              <><div className="mt-2 h-2 overflow-hidden rounded-full bg-sand-100"><div className="h-full bg-brand-700 transition-all" style={{ width: `${Math.round(p.progress * 100)}%` }} /></div><p className="text-caption mt-1 text-ink-soft">{t("adminProd.uploading", { pct: Math.round(p.progress * 100) })}</p></>
            ) : (
              <><p role="alert" className="text-caption mt-2 font-medium text-danger-fg">{t(apiErrorKey(p.error))}</p><Button variant="ghost" size="sm" className="mt-1" onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))}>{t("adminCommon.close")}</Button></>
            )}
          </li>
        ))}
      </ul>
      {action.error != null && !confirm && <ActionError error={action.error} onReload={onChanged} />}
      <input ref={fileRef} type="file" multiple accept={ALLOWED_IMAGE_TYPES.join(",")} className="sr-only" aria-label={t("admin.products.form.images.add")} onChange={(e) => void upload(e.target.files)} />
      <Button variant="outline" onClick={() => fileRef.current?.click()}><ImagePlus aria-hidden className="size-4" />{t("admin.products.form.images.add")}</Button>
      <Drawer open={confirm !== null} onClose={() => setConfirm(null)} title={t("adminProd.deleteImageTitle")} side="center"
        footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setConfirm(null)} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button variant="danger" loading={action.pending} onClick={remove}>{t("adminProd.deleteImageConfirm")}</Button></div>}>
        <p className="text-label font-normal text-ink-soft">{t("adminProd.deleteImageText")} {t("adminCommon.irreversible")}</p>
        {action.error != null && <div className="mt-3"><ActionError error={action.error} onReload={() => { setConfirm(null); onChanged(); }} /></div>}
      </Drawer>
    </div>
  );
}

// ---------------- stock summary (staff-only figures; stock itself is edited in inventory) ----------------
export function StockCard({ product }: { product: AdminProduct }) {
  const t = useT();
  const s = product.stock;
  return (
    <div className="space-y-3">
      {s.positions.length === 0 ? <Alert tone="warning">{t("adminProd.noStockText")}</Alert> : (
        <p className="text-label font-normal">{t("adminProd.stockRegistered", { onHand: s.onHand, reserved: s.reserved, available: s.available })}</p>
      )}
      <p className="text-caption text-ink-soft">{t("admin.products.form.stock.lockedHint")}</p>
      <ButtonLink href={`/admin/inventory?productId=${product.id}`} variant="outline" size="sm">{t(s.positions.length === 0 ? "adminProd.registerStock" : "admin.products.form.stock.goInventory")}</ButtonLink>
    </div>
  );
}

export { problemOf };
