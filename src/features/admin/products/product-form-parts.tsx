"use client";

import { ArrowDown, ArrowUp, ImagePlus, Images, Plus, Star, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import { MoneyText } from "@/components/ui/price";
import { PriceTiersTable } from "@/components/ui/price-tiers";
import Image from "@/components/ui/smart-image";
import { useLText, useLocale, useT } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { type DraftImage, type DraftOption, type ProductDraft, generateVariants, parseInteger, parseMoney, slugify, variantLabel } from "@/lib/catalog/draft";
import { readImageFile, sampleImageLibrary } from "@/lib/catalog/images";
import type { AttributeDef, CategoryRecord } from "@/lib/catalog/model";
import { snapshotFor, unitPriceFor } from "@/lib/catalog/pricing";
import { cn } from "@/lib/cn";
import { type CurrencyCode, SUPPORTED_CURRENCIES } from "@/lib/money";

export type Errors = Record<string, string>;
export type SetDraft = (fn: (d: ProductDraft) => ProductDraft) => void;
export const errText = (t: ReturnType<typeof useT>, errors: Errors, key: string) => (errors[key] ? t(`admin.products.errors.${errors[key]}` as MessageKey) : undefined);

export function Section({ id, step, title, hint, children, badge }: { id: string; step: number; title: string; hint?: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-24 rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-sand-100 text-sm font-semibold text-ink-soft">{step}</span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-t`} className="text-h3">{title}</h2>
          {hint && <p className="text-caption mt-0.5 text-ink-soft">{hint}</p>}
        </div>
        {badge}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

// ---------------- images ----------------
export function ImagesEditor({ images, onChange }: { images: DraftImage[]; onChange: (next: DraftImage[]) => void }) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DraftImage | null>(null);
  const [samples, setSamples] = useState(false);
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= images.length) return; const n = [...images]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(undefined);
    const added: DraftImage[] = [];
    for (const f of Array.from(files)) {
      try { added.push({ id: uid("img-"), src: await readImageFile(f) }); } catch { setError(t("admin.products.form.images.unreadable")); }
    }
    setBusy(false);
    if (added.length) onChange([...images, ...added]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const addSample = (src: string) => { if (!images.some((i) => i.src === src)) onChange([...images, { id: uid("img-"), src }]); };

  return (
    <>
      {images.length === 0 && <p className="text-label font-normal text-ink-soft">{t("admin.products.form.images.none")}</p>}
      <ul className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.id} className={cn("rounded-card border bg-surface p-2", i === 0 ? "border-brand-700 ring-1 ring-brand-700" : "border-line")}>
            <button type="button" onClick={() => setPreview(img)} className="relative block aspect-square w-full overflow-hidden rounded-control bg-sand-100" aria-label={t("admin.products.form.images.previewOf", { n: i + 1 })}>
              <Image src={img.src} alt="" fill sizes="160px" className="object-cover" />
            </button>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
              {i === 0 ? <Badge tone="brand"><Star aria-hidden className="mr-1 size-3" />{t("admin.products.form.images.primary")}</Badge> : <Button variant="ghost" size="sm" onClick={() => onChange([img, ...images.filter((x) => x.id !== img.id)])}>{t("admin.products.form.images.makePrimary")}</Button>}
              <div className="flex">
                <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${t("admin.products.form.images.moveUp")} ${i + 1}`}><ArrowUp aria-hidden className="size-4" /></Button>
                <Button variant="ghost" size="sm" disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label={`${t("admin.products.form.images.moveDown")} ${i + 1}`}><ArrowDown aria-hidden className="size-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => onChange(images.filter((x) => x.id !== img.id))} aria-label={`${t("admin.products.form.images.remove")} ${i + 1}`}><Trash2 aria-hidden className="size-4" /></Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" id="image-upload" onChange={(e) => addFiles(e.target.files)} aria-label={t("admin.products.form.images.add")} />
        <Button variant="outline" loading={busy} onClick={() => fileRef.current?.click()}><ImagePlus aria-hidden className="size-4" />{t("admin.products.form.images.add")}</Button>
        <Button variant="ghost" onClick={() => setSamples(true)}><Images aria-hidden className="size-4" />{t("admin.products.form.images.addSample")}</Button>
      </div>
      <p className="text-caption text-ink-muted">{t("admin.products.form.images.hint")}</p>
      {error && <p role="alert" className="text-caption font-medium text-danger-fg">{error}</p>}

      <Drawer open={!!preview} onClose={() => setPreview(null)} title={t("admin.products.form.images.previewTitle")} side="center">
        {preview && <div className="relative aspect-square w-full overflow-hidden rounded-card bg-sand-100"><Image src={preview.src} alt="" fill sizes="560px" className="object-contain" /></div>}
      </Drawer>
      <Drawer open={samples} onClose={() => setSamples(false)} title={t("admin.products.form.images.sampleTitle")} side="center" footer={<div className="flex justify-end"><Button onClick={() => setSamples(false)}>{t("common.close")}</Button></div>}>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {sampleImageLibrary.map((src) => {
            const used = images.some((i) => i.src === src);
            return <li key={src}><button type="button" disabled={used} onClick={() => addSample(src)} aria-label={src.split("/").pop()} className={cn("relative block aspect-square w-full overflow-hidden rounded-control border bg-sand-100", used ? "border-brand-700 opacity-50" : "border-line hover:border-ink-muted")}><Image src={src} alt="" fill sizes="120px" className="object-cover" /></button></li>;
          })}
        </ul>
      </Drawer>
    </>
  );
}

// ---------------- attributes ----------------
export function AttributesFields({ category, values, onChange, errors, hiddenKeys }: { category: CategoryRecord | undefined; values: Record<string, string>; onChange: (key: string, value: string) => void; errors: Errors; hiddenKeys: string[] }) {
  const t = useT();
  const lt = useLText();
  if (!category) return <p className="text-label font-normal text-ink-soft">{t("admin.products.form.attributes.chooseCategory")}</p>;
  const defs = category.attributes.filter((a) => !hiddenKeys.includes(a.key));
  if (defs.length === 0) return <p className="text-label font-normal text-ink-soft">{t("admin.products.form.attributes.none")}</p>;
  const label = (a: AttributeDef) => lt(a.label) + (a.type === "number" && a.unit ? ` (${a.unit})` : "");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {defs.map((a) => {
        const err = errText(t, errors, `attr.${a.key}`);
        const common = { label: label(a), optional: !a.required, error: err };
        return a.type === "select" ? (
          <SelectField key={a.key} {...common} value={values[a.key] ?? ""} onChange={(e) => onChange(a.key, e.target.value)}>
            <option value="">{t("admin.products.form.attributes.select")}</option>
            {a.options.map((o) => <option key={o.id} value={o.id}>{lt(o.label)}</option>)}
          </SelectField>
        ) : (
          <TextField key={a.key} {...common} inputMode={a.type === "number" ? "decimal" : undefined} value={values[a.key] ?? ""} onChange={(e) => onChange(a.key, e.target.value)} />
        );
      })}
    </div>
  );
}

// ---------------- variants ----------------
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function VariantsEditor({ draft, setDraft, category, errors, lockedVariantIds }: { draft: ProductDraft; setDraft: SetDraft; category?: CategoryRecord; errors: Errors; lockedVariantIds: string[] }) {
  const t = useT();
  const locale = useLocale() as "fr" | "ht";
  const lt = useLText();
  const axes = (category?.attributes ?? []).filter((a) => a.type === "select" && a.variantAxis && !draft.options.some((o) => o.key === a.key));
  const setOption = (i: number, fn: (o: DraftOption) => DraftOption) => setDraft((d) => ({ ...d, options: d.options.map((o, n) => (n === i ? fn(o) : o)) }));
  const addOption = (from?: AttributeDef) => setDraft((d) => ({ ...d, options: [...d.options, from
    ? { key: from.key, fr: from.label.fr, ht: from.label.ht, values: from.options.map((o) => ({ id: o.id, fr: o.label.fr, ht: o.label.ht })) }
    : { key: uid("opt"), fr: "", ht: "", values: [{ id: uid("v"), fr: "", ht: "" }] }] }));
  const removeOption = (i: number) => setDraft((d) => { const key = d.options[i].key; return { ...d, options: d.options.filter((_, n) => n !== i), variants: d.variants.map((v) => { const { [key]: _drop, ...rest } = v.optionValues; void _drop; return { ...v, optionValues: rest }; }) }; });
  const generate = () => setDraft((d) => ({ ...d, variants: generateVariants(d.options, d.variants, slugify(d.sku || d.nameFr || d.nameHt).toUpperCase().slice(0, 12)) }));
  const setVariant = (i: number, patch: Partial<ProductDraft["variants"][number]>) => setDraft((d) => ({ ...d, variants: d.variants.map((v, n) => (n === i ? { ...v, ...patch } : v)) }));

  return (
    <>
      <Checkbox label={t("admin.products.form.variants.toggle")} description={t("admin.products.form.variants.toggleHint")} checked={draft.hasVariants} onChange={(e) => setDraft((d) => ({ ...d, hasVariants: e.target.checked }))} />
      {draft.hasVariants && (
        <div className="space-y-5 border-t border-line pt-4">
          {errText(t, errors, "options") && <p role="alert" className="text-caption font-medium text-danger-fg">{errText(t, errors, "options")}</p>}
          <div>
            <p className="text-label mb-2 font-semibold">{t("admin.products.form.variants.options")}</p>
            <ul className="space-y-3">
              {draft.options.map((o, i) => (
                <li key={o.key} className="rounded-card border border-line p-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <TextField label={t("admin.products.form.variants.optionNameFr")} lang="fr" value={o.fr} onChange={(e) => setOption(i, (x) => ({ ...x, fr: e.target.value }))} />
                    <TextField label={t("admin.products.form.variants.optionNameHt")} lang="ht" value={o.ht} onChange={(e) => setOption(i, (x) => ({ ...x, ht: e.target.value }))} />
                    <Button variant="ghost" onClick={() => removeOption(i)}><Trash2 aria-hidden className="size-4" />{t("admin.products.form.variants.removeOption")}</Button>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {o.values.map((v, vi) => (
                      <li key={v.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                        <TextField label={t("admin.products.form.variants.valueFr")} lang="fr" value={v.fr} onChange={(e) => setOption(i, (x) => ({ ...x, values: x.values.map((y, n) => (n === vi ? { ...y, fr: e.target.value } : y)) }))} />
                        <TextField label={t("admin.products.form.variants.valueHt")} lang="ht" value={v.ht} onChange={(e) => setOption(i, (x) => ({ ...x, values: x.values.map((y, n) => (n === vi ? { ...y, ht: e.target.value } : y)) }))} />
                        <Button variant="ghost" size="sm" className="mb-1" onClick={() => setOption(i, (x) => ({ ...x, values: x.values.filter((_, n) => n !== vi) }))} aria-label={t("admin.products.form.variants.removeValue")}><Trash2 aria-hidden className="size-4" /></Button>
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setOption(i, (x) => ({ ...x, values: [...x.values, { id: uid("v"), fr: "", ht: "" }] }))}><Plus aria-hidden className="size-4" />{t("admin.products.form.variants.addValue")}</Button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => addOption()}><Plus aria-hidden className="size-4" />{t("admin.products.form.variants.addOption")}</Button>
              {axes.length > 0 && <span className="text-caption text-ink-soft">{t("admin.products.form.variants.fromCategory")}</span>}
              {axes.map((a) => <Button key={a.key} variant="secondary" size="sm" onClick={() => addOption(a)}>{lt(a.label)}</Button>)}
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-label font-semibold">{t("admin.products.form.variants.list")}</p>
              <Button onClick={generate} disabled={draft.options.every((o) => o.values.length === 0)}>{t("admin.products.form.variants.generate")}</Button>
            </div>
            {errText(t, errors, "variants") && <p role="alert" className="text-caption mb-2 font-medium text-danger-fg">{errText(t, errors, "variants")}</p>}
            {draft.variants.length === 0 ? <p className="text-label font-normal text-ink-soft">{t("admin.products.form.variants.none")}</p> : (
              <div className="overflow-x-auto rounded-card border border-line">
                <table className="w-full min-w-[40rem] text-left">
                  <caption className="sr-only">{t("admin.products.form.variants.list")}</caption>
                  <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted"><tr>
                    <th scope="col" className="px-3 py-2 font-medium">{t("admin.products.form.variants.col.variant")}</th><th scope="col" className="px-3 py-2 font-medium">SKU</th>
                    {enabledCurrencies(draft).map((c) => <th key={c} scope="col" className="px-3 py-2 font-medium">{t("admin.products.form.variants.col.priceIn", { currency: c })}</th>)}{draft.tracked && <th scope="col" className="px-3 py-2 font-medium">{t("admin.products.form.variants.col.stock")}</th>}
                    <th scope="col" className="px-3 py-2 font-medium">{t("admin.products.form.variants.col.active")}</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {draft.variants.map((v, i) => {
                      const label = variantLabel(v, draft.options, locale);
                      const locked = lockedVariantIds.includes(v.id);
                      const input = "text-label min-h-10 w-full rounded-control border bg-surface px-2";
                      return (
                        <tr key={v.id} className="text-label align-top font-normal">
                          <th scope="row" className="px-3 py-2 font-medium">{label || "—"}</th>
                          <td className="px-3 py-2"><input aria-label={`SKU — ${label}`} value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} aria-invalid={errors[`variant.${i}.sku`] ? true : undefined} className={cn(input, errors[`variant.${i}.sku`] ? "border-danger-fg" : "border-line-strong")} />{errText(t, errors, `variant.${i}.sku`) && <p className="text-caption mt-1 font-medium text-danger-fg">{errText(t, errors, `variant.${i}.sku`)}</p>}</td>
                          {enabledCurrencies(draft).map((c) => (
                            <td key={c} className="px-3 py-2"><input aria-label={`${t("admin.products.form.variants.col.priceIn", { currency: c })} — ${label}`} inputMode="decimal" placeholder={t("admin.products.form.variants.priceHint")} value={v.prices[c] ?? ""} onChange={(e) => setVariant(i, { prices: { ...v.prices, [c]: e.target.value } })} aria-invalid={errors[`variant.${i}.price.${c}`] ? true : undefined} className={cn(input, errors[`variant.${i}.price.${c}`] ? "border-danger-fg" : "border-line-strong")} />{errText(t, errors, `variant.${i}.price.${c}`) && <p className="text-caption mt-1 font-medium text-danger-fg">{errText(t, errors, `variant.${i}.price.${c}`)}</p>}</td>
                          ))}
                          {draft.tracked && <td className="px-3 py-2"><input aria-label={`${t("admin.products.form.variants.col.stock")} — ${label}`} inputMode="numeric" value={v.onHand} disabled={locked} onChange={(e) => setVariant(i, { onHand: e.target.value })} aria-invalid={errors[`variant.${i}.onHand`] ? true : undefined} className={cn(input, "disabled:bg-sand-50 disabled:text-ink-muted", errors[`variant.${i}.onHand`] ? "border-danger-fg" : "border-line-strong")} />{locked && <p className="text-caption mt-1 text-ink-muted">{t("admin.products.form.variants.stockLocked")}</p>}</td>}
                          <td className="px-3 py-2"><input type="checkbox" aria-label={`${t("admin.products.form.variants.col.active")} — ${label}`} checked={v.active} onChange={(e) => setVariant(i, { active: e.target.checked })} className="mt-2 size-5 accent-brand-700" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------- prices per currency ----------------
type DraftPriceSet = ProductDraft["prices"][CurrencyCode];
const patchPrice = (setDraft: SetDraft, cur: CurrencyCode, patch: Partial<DraftPriceSet>) => setDraft((d) => ({ ...d, prices: { ...d.prices, [cur]: { ...d.prices[cur], ...patch } } }));
export const enabledCurrencies = (draft: ProductDraft): CurrencyCode[] => SUPPORTED_CURRENCIES.filter((c) => draft.prices[c]?.enabled);

/**
 * One product, independent price sets: the seller chooses which currencies the product is sold in (HTG, USD or both) and
 * gives each its own retail, sale and minimum order. Nothing is converted or generated from another currency, and the
 * stock below is shared by all of them.
 */
export function PriceSetsEditor({ draft, setDraft, errors }: { draft: ProductDraft; setDraft: SetDraft; errors: Errors }) {
  const t = useT();
  return (
    <div className="space-y-5">
      {errText(t, errors, "prices") && <p role="alert" className="text-caption font-medium text-danger-fg">{errText(t, errors, "prices")}</p>}
      {SUPPORTED_CURRENCIES.map((cur) => {
        const dp = draft.prices[cur];
        return (
          <fieldset key={cur} className="min-w-0 rounded-card border border-line p-4">
            <legend className="px-1 text-label font-semibold">{cur}</legend>
            <Checkbox label={t("admin.products.form.pricing.sellIn", { currency: cur })} description={t("admin.products.form.pricing.sellInHint", { currency: cur })} checked={dp.enabled}
              onChange={(e) => patchPrice(setDraft, cur, { enabled: e.target.checked })} />
            {dp.enabled && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <TextField label={t("admin.products.form.pricing.retail", { currency: cur })} inputMode="decimal" hint={t("admin.products.form.pricing.retailHint")} value={dp.retail} onChange={(e) => patchPrice(setDraft, cur, { retail: e.target.value })} error={errText(t, errors, `price.${cur}.retail`)} />
                <TextField label={t("admin.products.form.pricing.sale", { currency: cur })} inputMode="decimal" optional hint={t("admin.products.form.pricing.saleHint")} value={dp.sale} onChange={(e) => patchPrice(setDraft, cur, { sale: e.target.value })} error={errText(t, errors, `price.${cur}.sale`)} />
                <TextField label={t("admin.products.form.pricing.minOrderIn", { currency: cur })} inputMode="numeric" optional hint={t("admin.products.form.pricing.minOrderHint")} value={dp.minOrderQty} onChange={(e) => patchPrice(setDraft, cur, { minOrderQty: e.target.value })} error={errText(t, errors, `price.${cur}.minOrderQty`)} />
              </div>
            )}
          </fieldset>
        );
      })}
      <p className="text-caption text-ink-muted">{t("admin.products.form.pricing.sharedStock")}</p>
    </div>
  );
}

// ---------------- wholesale (per currency) ----------------
export function WholesaleEditor({ draft, setDraft, errors, currency: cur }: { draft: ProductDraft; setDraft: SetDraft; errors: Errors; currency: CurrencyCode }) {
  const t = useT();
  const dp = draft.prices[cur];
  const unitLabel = (n: number) => t(`units.${draft.unit}`, { count: n });
  const [tryQty, setTryQty] = useState("12");
  const setTier = (i: number, patch: Partial<{ minQty: string; unitPrice: string }>) => patchPrice(setDraft, cur, { tiers: dp.tiers.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
  const rowErrors = (i: number) => Object.entries(errors).filter(([k]) => k.startsWith(`price.${cur}.tier.${i}.`)).map(([, code]) => t(`admin.products.errors.${code}` as MessageKey));
  const tierErr = (i: number, ...codes: string[]) => codes.some((c) => errors[`price.${cur}.tier.${i}.${c}`]);

  // Preview: what customers will see in THIS currency, computed from the values currently typed (ignored while invalid).
  const retail = parseMoney(dp.retail, cur);
  const tiers = dp.tiers.map((x) => ({ minQty: parseInteger(x.minQty), unitPrice: parseMoney(x.unitPrice, cur) })).filter((x): x is { minQty: number; unitPrice: number } => !!x.minQty && Number.isFinite(x.minQty) && !!x.unitPrice && Number.isFinite(x.unitPrice));
  const previewOk = !!retail && Number.isFinite(retail) && retail > 0 && tiers.length > 0;
  const sale = parseMoney(dp.sale, cur);
  const snap = previewOk ? snapshotFor({ currency: cur, retail: retail as number, sale: sale && Number.isFinite(sale) ? sale : undefined, wholesale: { enabled: true, tiers }, minOrderQty: parseInteger(dp.minOrderQty) }) : null;
  const q = Math.max(1, Math.floor(Number(tryQty) || 1));
  const up = snap ? unitPriceFor(snap, q) : null;

  return (
    <fieldset className="min-w-0 rounded-card border border-line p-4">
      <legend className="px-1 text-label font-semibold">{t("admin.products.form.wholesale.inCurrency", { currency: cur })}</legend>
      <Checkbox label={t("admin.products.form.wholesale.toggle")} description={t("admin.products.form.wholesale.toggleHint")} checked={dp.wholesaleEnabled}
        onChange={(e) => patchPrice(setDraft, cur, { wholesaleEnabled: e.target.checked, tiers: e.target.checked && dp.tiers.length === 0 ? [{ minQty: "5", unitPrice: "" }] : dp.tiers })} />
      {!dp.wholesaleEnabled && <p className="text-caption mt-2 text-ink-muted">{t("admin.products.form.wholesale.off")}</p>}
      {dp.wholesaleEnabled && (
        <div className="mt-4 grid gap-6 border-t border-line pt-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <p className="text-label mb-2 font-semibold">{t("admin.products.form.wholesale.tierTitle")}</p>
            {errText(t, errors, `price.${cur}.tiers`) && <p role="alert" className="text-caption mb-2 font-medium text-danger-fg">{errText(t, errors, `price.${cur}.tiers`)}</p>}
            <ul className="space-y-3">
              {dp.tiers.map((x, i) => (
                <li key={i} className="rounded-card border border-line p-3">
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <TextField label={i === 0 ? t("admin.products.form.wholesale.minQty") : t("admin.products.form.wholesale.tierMin")} inputMode="numeric" value={x.minQty} onChange={(e) => setTier(i, { minQty: e.target.value })} error={tierErr(i, "tierQtyInvalid", "tierOrder") ? " " : undefined} />
                    <TextField label={t("admin.products.form.wholesale.tierPrice", { currency: cur })} inputMode="decimal" value={x.unitPrice} onChange={(e) => setTier(i, { unitPrice: e.target.value })} error={tierErr(i, "tierPriceInvalid", "tierAboveBase", "tierPriceOrder") ? " " : undefined} />
                    <Button variant="ghost" size="sm" className="mb-1" onClick={() => patchPrice(setDraft, cur, { tiers: dp.tiers.filter((_, n) => n !== i) })} aria-label={t("admin.products.form.wholesale.remove")}><Trash2 aria-hidden className="size-4" /></Button>
                  </div>
                  {rowErrors(i).map((m) => <p key={m} role="alert" className="text-caption mt-1.5 font-medium text-danger-fg">{m}</p>)}
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { const last = Math.max(0, ...dp.tiers.map((x) => Number(x.minQty) || 0)); patchPrice(setDraft, cur, { tiers: [...dp.tiers, { minQty: String(last ? last * 2 : 5), unitPrice: "" }] }); }}><Plus aria-hidden className="size-4" />{t("admin.products.form.wholesale.add")}</Button>
            <p className="text-caption mt-3 text-ink-muted">{t("admin.products.form.wholesale.variantNote")}</p>
          </div>
          <div className="rounded-card border border-dashed border-line-strong bg-sand-50 p-4">
            <p className="text-label mb-3 font-semibold">{t("admin.products.form.wholesale.previewTitle")}</p>
            {snap && up ? (
              <>
                <PriceTiersTable snapshot={snap} unit={draft.unit} quantity={q} />
                <div className="mt-4 flex items-end gap-3">
                  <TextField className="w-28" label={t("admin.products.form.wholesale.tryQty")} inputMode="numeric" value={tryQty} onChange={(e) => setTryQty(e.target.value.replace(/\D/g, ""))} />
                  <p className="text-label pb-2 font-normal" aria-live="polite">{unitLabel(q)} → <MoneyText value={{ amount: up.unitPrice, currency: cur }} /> × {q} = <strong><MoneyText value={{ amount: up.unitPrice * q, currency: cur }} /></strong></p>
                </div>
              </>
            ) : <Alert tone="info">{t("admin.products.form.wholesale.previewEmpty")}</Alert>}
          </div>
        </div>
      )}
    </fieldset>
  );
}
