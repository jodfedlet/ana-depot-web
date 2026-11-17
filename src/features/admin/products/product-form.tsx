"use client";

import { ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ActionError, AdminErrorState } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLText, useT } from "@/i18n/provider";
import { type ProductForm as Form, axesOf, emptyProductForm, formToRequest, productToForm } from "@/lib/admin/product-form";
import type { AdminCategory, AdminProduct } from "@/lib/api/admin/dto";
import { createProduct, deleteProduct, getCategory, getProduct, listAllCategories, setProductStatus, updateProduct } from "@/lib/api/admin/endpoints";
import { useAction, useAdminResource } from "@/lib/api/admin/hooks";
import { announceAdminChange } from "@/lib/api/admin/signals";
import { fieldProblems, problemOf } from "@/lib/api/errors";
import { attemptKey, endAttempt } from "@/lib/api/idempotency";
import { cn } from "@/lib/cn";
import { useUnsavedChanges } from "../admin-shell";
import { AttributesFields, ImagesPanel, PricesEditor, Section, StockCard, VariantsEditor, enabledCurrencies, productAttributesOf } from "./product-form-parts";

export function ProductEditor({ id }: { id?: string }) {
  const res = useAdminResource(id ? `product:${id}` : null, (signal) => getProduct(id as string, { signal }));
  if (!id) return <ProductFormView key="new" product={undefined} initial={emptyProductForm()} onReload={() => undefined} />;
  if (res.error != null && !res.data) return <AdminErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Skeleton className="h-96 w-full" />;
  // `key` = id + version: after a save, a reload, or a version conflict the form is rebuilt from the server's current data
  return <ProductFormView key={`${res.data.id}:${res.data.version}`} product={res.data} initial={productToForm(res.data)} onReload={res.reload} />;
}

const isTransient = (e: unknown) => { const p = problemOf(e); return !!p && (p.code === "timeout" || p.code === "network_error" || p.status >= 502); };

function ProductFormView({ product, initial, onReload }: { product: AdminProduct | undefined; initial: Form; onReload: () => void }) {
  const t = useT();
  const lt = useLText();
  const router = useLocaleRouter();
  const toast = useToast();
  const save = useAction();
  const life = useAction();
  const [form, setFormState] = useState<Form>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [confirm, setConfirm] = useState<"publish" | "activate" | "deactivate" | "delete" | null>(null);
  const dirty = JSON.stringify(form) !== baseline;
  useUnsavedChanges(dirty);
  const setForm = (fn: (f: Form) => Form) => setFormState(fn);
  const problems = fieldProblems(save.error);

  const cats = useAdminResource("categories:all", (signal) => listAllCategories(signal));
  const category = useAdminResource<AdminCategory>(form.categoryId ? `category:${form.categoryId}` : null, (signal) => getCategory(form.categoryId, { signal }));
  const loaded = category.data && category.data.id === form.categoryId ? category.data : undefined;
  const axes = axesOf(loaded);
  const attrs = productAttributesOf(loaded, form.variants);
  const enabled = enabledCurrencies(form);

  const sub = (raw: string): string => {
    const override = /^retailOverrides\.([A-Z]{3})$/.exec(raw);
    if (override) return `${t("admin.products.form.variants.col.priceIn", { currency: override[1] })}`;
    const tier = /^tiers\[(\d+)\]\.(.+)$/.exec(raw);
    if (tier) return `${t("adminProd.sub.tiers")} ${Number(tier[1]) + 1} · ${sub(tier[2])}`;
    return (["retail", "sale", "minOrderQuantity", "tiers", "sku", "axisValues", "position"] as const).includes(raw as "retail") ? t(`adminProd.sub.${raw as "retail"}`) : raw;
  };
  const label = (field: string): string => {
    const price = /^prices\[(\d+)\]\.(.+)$/.exec(field);
    if (price) return t("adminProd.pricePath", { currency: enabled[Number(price[1])] ?? "", field: sub(price[2]) });
    const variant = /^variants\[(\d+)\]\.(.+)$/.exec(field);
    if (variant) return t("adminProd.variantPath", { n: Number(variant[1]) + 1, field: sub(variant[2]) });
    const known = ["sku", "slug", "categoryId", "name.fr", "name.ht", "prices", "variants", "attributes"] as const;
    return (known as readonly string[]).includes(field) ? t(`adminProd.fieldNames.${field as "sku"}`) : field;
  };
  const fe = (path: string) => (problems[path] ? label(path) && t(`fieldErrors.${problems[path] in KNOWN ? problems[path] : "invalid"}` as never) : undefined);

  const submit = async (status?: "DRAFT" | "ACTIVE") => {
    const body = formToRequest(form, { status });
    const scope = `product:${form.id ?? "new"}`;
    const key = attemptKey(scope, body);
    const r = await save.run(() => (form.id ? updateProduct(form.id, body, { idempotencyKey: key }) : createProduct(body, { idempotencyKey: key })));
    if (!r.ok) { if (!isTransient(r.error)) endAttempt(scope); window.setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid='true'], [role='alert']")?.scrollIntoView({ block: "center" })); return; }
    endAttempt(scope);
    setBaseline(JSON.stringify(form));
    announceAdminChange();
    if (form.id) { toast.show({ tone: "success", message: t("adminProd.saved") }); onReload(); }
    else { toast.show({ tone: "success", message: t(status === "ACTIVE" ? "adminProd.published" : "adminProd.createdDraft") }); router.replace(`/admin/products/${r.value.id}`); }
  };

  const lifecycle = async () => {
    if (!product || !confirm) return;
    const scope = `product-status:${product.id}:${confirm}`;
    const r = await life.run((): Promise<unknown> => confirm === "delete" ? deleteProduct(product.id, { idempotencyKey: attemptKey(scope, {}) }) : setProductStatus(product.id, confirm === "deactivate" ? "INACTIVE" : "ACTIVE", undefined, { idempotencyKey: attemptKey(scope, { v: product.version }) }));
    if (!r.ok) { if (!isTransient(r.error)) endAttempt(scope); return; }
    endAttempt(scope);
    announceAdminChange();
    setConfirm(null);
    toast.show({ tone: "success", message: t(confirm === "publish" ? "adminProd.published" : confirm === "activate" ? "adminProd.activated" : confirm === "deactivate" ? "adminProd.deactivated" : "adminProd.deleted") });
    if (confirm === "delete") router.replace("/admin/products"); else onReload();
  };

  const status = product?.status;
  const name = lt({ fr: form.nameFr, ht: form.nameHt });
  const confirmTitle = confirm === "publish" ? "adminProd.publishTitle" : confirm === "activate" ? "adminProd.activateTitle" : confirm === "deactivate" ? "adminProd.deactivateTitle" : "adminProd.deleteTitle";
  const confirmText = confirm === "publish" ? "adminProd.publishText" : confirm === "activate" ? "adminProd.activateText" : confirm === "deactivate" ? "adminProd.deactivateText" : "adminProd.deleteText";

  return (
    <div className="pb-28">
      <header className="mb-6">
        <Link href="/admin/products" className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">← {t("admin.products.backToList")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-h1">{product ? name || t("admin.products.untitled") : t("admin.products.form.titleNew")}</h1>
          {status && <Badge tone={status === "ACTIVE" ? "success" : status === "DRAFT" ? "warning" : "neutral"}>{t(`admin.products.statuses.${status.toLowerCase() as "draft"}`)}</Badge>}
        </div>
        {product && status === "ACTIVE" && <Link href={`/products/${product.slug}`} className="text-caption mt-2 inline-flex items-center gap-1 font-semibold text-brand-700 underline"><ExternalLink aria-hidden className="size-3.5" />{t("adminProd.viewInStore")}</Link>}
      </header>

      <div className="max-w-5xl space-y-6">
        {save.error != null && <ActionError error={save.error} onReload={onReload} fieldLabel={label} />}

        <Section id="sec-category" title={t("admin.products.form.steps.category")} hint={product ? undefined : t("adminProd.chooseCategory")}>
          {product ? (
            <p className="text-label font-normal">{lt({ fr: loaded?.name.fr ?? "", ht: loaded?.name.ht ?? "" }) || "…"} <span className="text-caption text-ink-muted">· {t("adminCat.moveHint")}</span></p>
          ) : (
            <SelectField label={t("admin.products.form.category.label")} value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value, variants: [], attributes: {} }))} error={fe("categoryId")}>
              <option value="">{t("admin.products.form.category.placeholder")}</option>
              {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{lt({ fr: c.name.fr ?? "", ht: c.name.ht ?? "" }) || c.slug}{c.active ? "" : ` (${t("admin.categories.inactive")})`}</option>)}
            </SelectField>
          )}
        </Section>

        <Section id="sec-basics" title={t("admin.products.form.steps.basics")} hint={t("admin.products.form.basics.translationHint")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("admin.products.form.basics.nameFr")} lang="fr" value={form.nameFr} onChange={(e) => setForm((f) => ({ ...f, nameFr: e.target.value }))} error={fe("name.fr")} />
            <TextField label={t("admin.products.form.basics.nameHt")} lang="ht" value={form.nameHt} onChange={(e) => setForm((f) => ({ ...f, nameHt: e.target.value }))} error={fe("name.ht")} />
            <TextAreaField label={t("admin.products.form.basics.descFr")} lang="fr" optional rows={4} value={form.descFr} onChange={(e) => setForm((f) => ({ ...f, descFr: e.target.value }))} />
            <TextAreaField label={t("admin.products.form.basics.descHt")} lang="ht" optional rows={4} value={form.descHt} onChange={(e) => setForm((f) => ({ ...f, descHt: e.target.value }))} />
            <TextField label={t("adminProd.sku")} value={form.sku} hint={t("admin.products.form.basics.skuHint")} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} error={fe("sku")} />
            <TextField label={t("admin.products.form.basics.brand")} value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
            {product && <TextField label={t("adminProd.slug")} value={form.slug} readOnly hint={t("adminProd.slugHint")} />}
          </div>
        </Section>

        <Section id="sec-images" title={t("admin.products.form.steps.images")}>
          {product ? <ImagesPanel product={product} onChanged={onReload} /> : <Alert tone="info">{t("adminProd.saveFirst")}</Alert>}
        </Section>

        <Section id="sec-attributes" title={t("admin.products.form.steps.attributes")} hint={loaded ? t("admin.products.form.attributes.hint", { category: lt({ fr: loaded.name.fr ?? "", ht: loaded.name.ht ?? "" }) }) : undefined}>
          {!form.categoryId ? <p className="text-label font-normal text-ink-soft">{t("admin.products.form.attributes.chooseCategory")}</p> : !loaded ? <Skeleton className="h-16 w-full" /> : <AttributesFields attrs={attrs} form={form} setForm={setForm} problems={problems} />}
        </Section>

        <Section id="sec-variants" title={t("admin.products.form.steps.variants")}>
          {!form.categoryId ? <p className="text-label font-normal text-ink-soft">{t("admin.products.form.attributes.chooseCategory")}</p> : !loaded ? <Skeleton className="h-16 w-full" /> : <VariantsEditor form={form} setForm={setForm} axes={axes} problems={problems} />}
        </Section>

        <Section id="sec-pricing" title={t("admin.products.form.steps.pricing")}>
          <PricesEditor form={form} setForm={setForm} problems={problems} />
        </Section>

        {product && <Section id="sec-stock" title={t("admin.products.form.steps.stock")}><StockCard product={product} /></Section>}

        {product && (
          <Section id="sec-lifecycle" title={t("admin.products.status")}>
            {dirty && <Alert tone="warning">{t("adminProd.unsavedStatus")}</Alert>}
            {life.error != null && !confirm && <ActionError error={life.error} onReload={onReload} />}
            <div className="flex flex-wrap gap-2">
              {status === "DRAFT" && <><Button disabled={dirty} onClick={() => { life.clear(); setConfirm("publish"); }}>{t("admin.products.form.review.publish")}</Button><Button variant="danger" disabled={dirty} onClick={() => { life.clear(); setConfirm("delete"); }}>{t("adminProd.deleteDraft")}</Button></>}
              {status === "ACTIVE" && <Button variant="outline" disabled={dirty} onClick={() => { life.clear(); setConfirm("deactivate"); }}>{t("admin.products.deactivate")}</Button>}
              {status === "INACTIVE" && <Button disabled={dirty} onClick={() => { life.clear(); setConfirm("activate"); }}>{t("admin.products.activate")}</Button>}
            </div>
          </Section>
        )}
      </div>

      <div role="region" aria-label={t("admin.products.form.actions")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-float backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className={cn("text-label", dirty ? "font-semibold text-warning-fg" : "font-normal text-ink-soft")} role="status">{dirty ? t("admin.products.form.notSaved") : product ? t("admin.products.form.upToDate") : t("admin.products.form.intro")}</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/products" variant="ghost">{t("common.cancel")}</ButtonLink>
            {product ? <Button loading={save.pending} onClick={() => submit()}>{t("admin.products.form.review.save")}</Button> : <>
              <Button variant="outline" loading={save.pending} onClick={() => submit("DRAFT")}>{t("admin.products.form.review.saveDraft")}</Button>
              <Button loading={save.pending} onClick={() => submit("ACTIVE")}>{t("admin.products.form.review.publish")}</Button>
            </>}
          </div>
        </div>
      </div>

      <Drawer open={confirm !== null} onClose={() => setConfirm(null)} title={t(confirmTitle)} side="center"
        footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setConfirm(null)} disabled={life.pending}>{t("adminCommon.cancel")}</Button><Button variant={confirm === "delete" || confirm === "deactivate" ? "danger" : "primary"} loading={life.pending} onClick={lifecycle}>{t("adminCommon.confirm")}</Button></div>}>
        <p className="text-label font-normal text-ink-soft">{t(confirmText)}{confirm === "delete" && ` ${t("adminCommon.irreversible")}`}</p>
        {life.error != null && <div className="mt-3"><ActionError error={life.error} onReload={() => { setConfirm(null); onReload(); }} /></div>}
      </Drawer>
    </div>
  );
}

const KNOWN: Record<string, true> = { required: true, invalid: true, too_long: true, too_many_decimals: true, must_be_positive: true, required_to_publish: true, retail_price_invalid: true, sale_price_invalid: true, price_required: true, duplicate_sku: true, duplicate_slug: true };
