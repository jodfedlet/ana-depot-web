"use client";

import { AlertCircle, Check, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { market } from "@/config/market";
import Image from "@/components/ui/smart-image";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLText, useLocale, useT } from "@/i18n/provider";
import { saveCategory } from "@/lib/api/catalog-admin";
import { saveProduct } from "@/lib/api/catalog-admin";
import { type ProductDraft, emptyDraft, parseMoney, recordToDraft, validateDraft } from "@/lib/catalog/draft";
import { type AttributeDef, type CategoryRecord, type ManualAvailability, type ProductRecord, type ProductStatus, unitIds } from "@/lib/catalog/model";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { useAdminSession } from "@/features/admin/admin-identity";
import { useCatalogState } from "@/lib/stores/catalog-store";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { focusFirstInvalid } from "@/lib/validation";
import { useUnsavedChanges } from "../admin-shell";
import { AttributeEditor } from "../categories/attribute-editor";
import { AttributesFields, ImagesEditor, Section, VariantsEditor, WholesaleEditor, errText } from "./product-form-parts";

const STEPS = ["category", "basics", "images", "attributes", "variants", "pricing", "wholesale", "stock", "review"] as const;
type Step = (typeof STEPS)[number];

/** Which section a validation key belongs to (for the checklist and for scrolling to the first problem). */
function sectionOf(key: string): Step {
  if (key === "category") return "category";
  if (key === "name" || key === "sku") return "basics";
  if (key.startsWith("attr.")) return "attributes";
  if (key === "options" || key === "variants" || key.startsWith("variant.")) return "variants";
  if (key === "retail" || key === "sale" || key === "minOrderQty") return "pricing";
  if (key === "tiers" || key.startsWith("tier.")) return "wholesale";
  return "stock";
}

export function ProductEditor({ id }: { id?: string }) {
  const t = useT();
  const ready = useIsClient();
  const { products } = useCatalogState();
  const existing = id ? products.find((p) => p.id === id) : undefined;
  if (!ready) return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-8 w-64" /><Skeleton className="mt-6 h-96 w-full" /></div>;
  if (id && !existing) return <EmptyState title={t("admin.products.notFoundTitle")} description={t("admin.products.notFoundText")}><ButtonLink href="/admin/products">{t("admin.products.backToList")}</ButtonLink></EmptyState>;
  // Remount with fresh state whenever the saved record changes (e.g. after saving).
  return <ProductForm key={existing?.updatedAt ?? "new"} existing={existing} />;
}

function ProductForm({ existing }: { existing?: ProductRecord }) {
  const t = useT();
  const lt = useLText();
  const locale = useLocale();
  const router = useLocaleRouter();
  const toast = useToast();
  const { session } = useAdminSession();
  const { categories, products } = useCatalogState();
  const initial = useMemo(() => (existing ? recordToDraft(existing) : emptyDraft()), [existing]);
  const [draft, setDraftState] = useState<ProductDraft>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [attempt, setAttempt] = useState<"draft" | "publish" | null>(null);
  const [saving, setSaving] = useState<ProductStatus | null>(null);
  const [addAttr, setAddAttr] = useState<AttributeDef | null>(null);
  const [formError, setFormError] = useState<string>();

  const setDraft = (fn: (d: ProductDraft) => ProductDraft) => setDraftState(fn);
  const patch = (p: Partial<ProductDraft>) => setDraftState((d) => ({ ...d, ...p }));
  const category = categories.find((c) => c.slug === draft.categorySlug);
  const otherSkus = useMemo(() => products.filter((p) => p.id !== existing?.id).flatMap((p) => [p.sku, ...p.variants.map((v) => v.sku)]).filter(Boolean), [products, existing]);
  const publishIssues = useMemo(() => validateDraft(draft, category, otherSkus, "publish"), [draft, category, otherSkus]);
  const errors = attempt ? validateDraft(draft, category, otherSkus, attempt) : {};
  const dirty = JSON.stringify(draft) !== baseline;
  useUnsavedChanges(dirty);

  const status = existing?.status ?? "draft";
  const lockedVariantIds = existing?.variants.map((v) => v.id) ?? [];
  const editing = !!existing;
  const issueCount = (step: Step) => Object.keys(publishIssues).filter((k) => sectionOf(k) === step).length;
  const retail = parseMoney(draft.retail, draft.currency);
  const previewName = draft.nameFr || draft.nameHt || t("admin.products.untitled");

  const submit = async (target: ProductStatus) => {
    const mode = target === "active" ? "publish" : "draft";
    setAttempt(mode);
    setFormError(undefined);
    const local = validateDraft(draft, category, otherSkus, mode);
    if (Object.keys(local).length) {
      const first = sectionOf(Object.keys(local)[0]);
      document.getElementById(`sec-${first}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => focusFirstInvalid(document.getElementById(`sec-${first}`) as unknown as HTMLFormElement), 350);
      return;
    }
    setSaving(target);
    const result = await saveProduct(draft, target, session?.name ?? "Staff");
    setSaving(null);
    if (!result.ok) { setFormError(t("admin.products.form.review.saveFailed")); return; }
    setBaseline(JSON.stringify(draft));
    toast.show({ tone: "success", message: `${target === "active" ? t("admin.products.toasts.published") : target === "inactive" ? t("admin.products.toasts.deactivated") : existing ? t("admin.products.toasts.saved") : t("admin.products.toasts.savedDraft")} ${t("admin.demo.saved")}` });
    if (!existing) router.push(`/admin/products/${result.data.id}`);
  };

  const activeCategories = categories.filter((c) => c.active || c.slug === draft.categorySlug).sort((a, b) => a.order - b.order);
  const changeCategory = (slug: string) => setDraftState((d) => ({ ...d, categorySlug: slug, attributes: {} }));

  const saveNewAttribute = async () => {
    if (!addAttr || !category) return;
    const def = { ...addAttr, key: "" };
    const r = await saveCategory({ ...category, attributes: [...category.attributes, def] }, false);
    if (r.ok) setAddAttr(null);
  };

  return (
    <div className="pb-28">
      <header className="mb-6">
        <Link href="/admin/products" className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">← {t("admin.products.backToList")}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-h1">{editing ? t("admin.products.form.titleEdit") : t("admin.products.form.titleNew")}</h1>
          <Badge tone={status === "active" ? "success" : status === "draft" ? "warning" : "neutral"}>{t(`admin.products.statuses.${status}`)}</Badge>
          {existing?.isSample && <Badge>{t("common.sample")}</Badge>}
        </div>
        <p className="text-body mt-1 text-ink-soft">{editing ? previewName : t("admin.products.form.intro")}</p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-6">
          <Section id="sec-category" step={1} title={t("admin.products.form.steps.category")} hint={t("admin.products.form.category.hint")}>
            <SelectField label={t("admin.products.form.category.label")} value={draft.categorySlug} onChange={(e) => changeCategory(e.target.value)} error={errText(t, errors, "category")}>
              <option value="">{t("admin.products.form.category.placeholder")}</option>
              {activeCategories.map((c) => <option key={c.slug} value={c.slug}>{lt(c.name)}{c.active ? "" : ` (${t("admin.categories.inactive")})`}</option>)}
            </SelectField>
            <Link href="/admin/categories/new" className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">{t("admin.products.form.category.createNew")}</Link>
          </Section>

          <Section id="sec-basics" step={2} title={t("admin.products.form.steps.basics")} hint={t("admin.products.form.basics.translationHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t("admin.products.form.basics.nameFr")} lang="fr" value={draft.nameFr} onChange={(e) => patch({ nameFr: e.target.value })} error={errText(t, errors, "name")} />
              <TextField label={t("admin.products.form.basics.nameHt")} lang="ht" value={draft.nameHt} onChange={(e) => patch({ nameHt: e.target.value })} />
              <TextAreaField label={t("admin.products.form.basics.descFr")} lang="fr" rows={4} optional value={draft.descFr} onChange={(e) => patch({ descFr: e.target.value })} />
              <TextAreaField label={t("admin.products.form.basics.descHt")} lang="ht" rows={4} optional value={draft.descHt} onChange={(e) => patch({ descHt: e.target.value })} />
              <TextField label={t("admin.products.form.basics.sku")} hint={t("admin.products.form.basics.skuHint")} value={draft.sku} onChange={(e) => patch({ sku: e.target.value })} error={errText(t, errors, "sku")} />
              <TextField label={t("admin.products.form.basics.brand")} optional value={draft.brand} onChange={(e) => patch({ brand: e.target.value })} />
            </div>
          </Section>

          <Section id="sec-images" step={3} title={t("admin.products.form.steps.images")}>
            <ImagesEditor images={draft.images} onChange={(images) => patch({ images })} />
          </Section>

          <Section id="sec-attributes" step={4} title={t("admin.products.form.steps.attributes")} hint={category ? t("admin.products.form.attributes.hint", { category: lt(category.name) }) : undefined}>
            <AttributesFields category={category} values={draft.attributes} errors={errors} hiddenKeys={draft.hasVariants ? draft.options.map((o) => o.key) : []} onChange={(k, v) => setDraftState((d) => ({ ...d, attributes: { ...d.attributes, [k]: v } }))} />
            {category && <Button variant="outline" size="sm" onClick={() => setAddAttr({ key: "", label: { fr: "", ht: "" }, type: "select", options: [], filterable: false, required: false, variantAxis: false })}>{t("admin.products.form.attributes.add")}</Button>}
          </Section>

          <Section id="sec-variants" step={5} title={t("admin.products.form.steps.variants")} badge={<Badge>{t("common.optional")}</Badge>}>
            <VariantsEditor draft={draft} setDraft={setDraft} category={category} errors={errors} lockedVariantIds={lockedVariantIds} />
          </Section>

          <Section id="sec-pricing" step={6} title={t("admin.products.form.steps.pricing")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label={t("admin.products.form.pricing.unit")} value={draft.unit} onChange={(e) => patch({ unit: e.target.value as ProductDraft["unit"] })}>
                {unitIds.map((u) => <option key={u} value={u}>{t(`units.${u}`, { count: 1 })}</option>)}
              </SelectField>
              <SelectField label={t("admin.products.form.pricing.currency")} hint={t("admin.products.form.pricing.currencyHint")} value={draft.currency} onChange={(e) => patch({ currency: e.target.value as ProductDraft["currency"] })} error={errText(t, errors, "currency")}>
                {market.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectField>
              <TextField label={t("admin.products.form.pricing.unitNoteFr")} lang="fr" optional hint={t("admin.products.form.pricing.unitNoteHint")} value={draft.unitNoteFr} onChange={(e) => patch({ unitNoteFr: e.target.value })} />
              <TextField label={t("admin.products.form.pricing.unitNoteHt")} lang="ht" optional value={draft.unitNoteHt} onChange={(e) => patch({ unitNoteHt: e.target.value })} />
              <TextField label={t("admin.products.form.pricing.retail", { currency: draft.currency })} inputMode="decimal" hint={t("admin.products.form.pricing.retailHint")} value={draft.retail} onChange={(e) => patch({ retail: e.target.value })} error={errText(t, errors, "retail")} />
              <TextField label={t("admin.products.form.pricing.sale", { currency: draft.currency })} inputMode="decimal" optional hint={t("admin.products.form.pricing.saleHint")} value={draft.sale} onChange={(e) => patch({ sale: e.target.value })} error={errText(t, errors, "sale")} />
              <TextField label={t("admin.products.form.pricing.minOrder")} inputMode="numeric" optional hint={t("admin.products.form.pricing.minOrderHint")} value={draft.minOrderQty} onChange={(e) => patch({ minOrderQty: e.target.value })} error={errText(t, errors, "minOrderQty")} />
            </div>
          </Section>

          <Section id="sec-wholesale" step={7} title={t("admin.products.form.steps.wholesale")} badge={<Badge>{t("common.optional")}</Badge>}>
            <WholesaleEditor draft={draft} setDraft={setDraft} errors={errors} />
          </Section>

          <Section id="sec-stock" step={8} title={t("admin.products.form.steps.stock")}>
            <Checkbox label={t("admin.products.form.stock.tracked")} description={t("admin.products.form.stock.trackedHint")} checked={draft.tracked} onChange={(e) => patch({ tracked: e.target.checked })} />
            {draft.tracked ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {!draft.hasVariants ? (
                  <div>
                    <TextField label={editing ? t("admin.products.form.stock.current") : t("admin.products.form.stock.onHand")} inputMode="numeric" value={draft.onHand} disabled={editing && existing?.inventory.tracked} onChange={(e) => patch({ onHand: e.target.value })} error={errText(t, errors, "onHand")} />
                    {editing && existing?.inventory.tracked && <p className="text-caption mt-1.5 text-ink-soft">{t("admin.products.form.stock.lockedHint")} <Link href="/admin/inventory" className="font-semibold text-brand-700 underline">{t("admin.products.form.stock.goInventory")}</Link></p>}
                  </div>
                ) : <p className="text-label font-normal text-ink-soft sm:col-span-2">{t("admin.products.form.stock.perVariant")}</p>}
                <TextField label={t("admin.products.form.stock.lowStock")} optional inputMode="numeric" hint={t("admin.products.form.stock.lowStockHint")} value={draft.lowStock} onChange={(e) => patch({ lowStock: e.target.value })} error={errText(t, errors, "lowStock")} />
              </div>
            ) : (
              <SelectField label={t("admin.products.form.stock.availability")} value={draft.manualAvailability} onChange={(e) => patch({ manualAvailability: e.target.value as ManualAvailability })}>
                {(["in_stock", "out_of_stock", "preorder"] as const).map((a) => <option key={a} value={a}>{t(`availability.${a}`)}</option>)}
              </SelectField>
            )}
          </Section>

          <Section id="sec-review" step={9} title={t("admin.products.form.steps.review")}>
            {Object.keys(publishIssues).length === 0 ? (
              <Alert tone="success" live="polite">{t("admin.products.form.review.ready")}</Alert>
            ) : (
              <div>
                <Alert tone="warning" live="polite" title={t("admin.products.form.review.blockers", { count: Object.keys(publishIssues).length })}>{t("admin.products.form.review.blockersText")}</Alert>
                <ul className="mt-3 space-y-1.5">
                  {STEPS.filter((s) => issueCount(s) > 0).map((s) => <li key={s}><a href={`#sec-${s}`} className="text-label inline-flex min-h-9 items-center gap-2 font-semibold text-brand-700 underline underline-offset-2"><AlertCircle aria-hidden className="size-4" />{t(`admin.products.form.steps.${s}`)} ({issueCount(s)})</a></li>)}
                </ul>
              </div>
            )}
            {formError && <Alert tone="danger" live="assertive">{formError}</Alert>}
          </Section>
        </div>

        <aside aria-label={t("admin.products.form.stepsLabel")} className="hidden xl:block">
          <div className="sticky top-20 space-y-4">
            <nav className="rounded-card border border-line bg-surface p-3">
              <ol className="space-y-0.5">
                {STEPS.map((s, i) => (
                  <li key={s}><a href={`#sec-${s}`} className="text-label flex min-h-9 items-center gap-2.5 rounded-control px-2 font-normal text-ink-soft hover:bg-sand-100 hover:text-ink">
                    <span className={cn("grid size-5 place-items-center rounded-full text-[0.6875rem] font-semibold", s === "review" ? "bg-sand-100" : issueCount(s) === 0 ? "bg-success-bg text-success-fg" : "bg-warning-bg text-warning-fg")}>{s !== "review" && issueCount(s) === 0 ? <Check aria-hidden className="size-3" /> : i + 1}</span>
                    {t(`admin.products.form.steps.${s}`)}
                  </a></li>
                ))}
              </ol>
            </nav>
            <div className="rounded-card border border-line bg-surface p-3">
              <p className="text-eyebrow mb-2 text-ink-muted">{t("admin.products.form.preview")}</p>
              <div className="relative aspect-square overflow-hidden rounded-control bg-sand-100"><Image src={draft.images[0]?.src ?? "/sample/placeholder.svg"} alt="" fill sizes="240px" className="object-cover" /></div>
              <p className="text-label mt-2 font-semibold">{previewName}</p>
              <p className="text-caption text-ink-soft">{retail && Number.isFinite(retail) ? `${formatMoney({ amount: retail, currency: draft.currency }, locale)} / ${t(`units.${draft.unit}`, { count: 1 })}` : "—"}</p>
              {existing?.status === "active" && <Link href={`/products/${existing.slug}`} className="text-caption mt-2 inline-flex items-center gap-1 font-semibold text-brand-700 underline" ><ExternalLink aria-hidden className="size-3" />{t("admin.products.form.viewInStore")}</Link>}
            </div>
          </div>
        </aside>
      </div>

      {/* Action bar */}
      <div role="region" aria-label={t("admin.products.form.actions")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-float backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="text-label font-normal text-ink-soft" role="status">{dirty ? <span className="font-semibold text-warning-fg">{t("admin.pickupSettings.unsaved.bar")}</span> : existing ? t("admin.products.form.upToDate") : t("admin.products.form.notSaved")}</p>
          <div className="flex flex-wrap gap-2">
            {status === "draft" && <>
              <Button variant="outline" loading={saving === "draft"} onClick={() => submit("draft")}>{t("admin.products.form.review.saveDraft")}</Button>
              <Button loading={saving === "active"} onClick={() => submit("active")}>{t("admin.products.form.review.publish")}</Button>
            </>}
            {status === "active" && <>
              <Button variant="outline" loading={saving === "inactive"} onClick={() => submit("inactive")}>{t("admin.products.deactivate")}</Button>
              <Button loading={saving === "active"} onClick={() => submit("active")}>{t("admin.products.form.review.save")}</Button>
            </>}
            {status === "inactive" && <>
              <Button variant="outline" loading={saving === "inactive"} onClick={() => submit("inactive")}>{t("admin.products.form.review.save")}</Button>
              <Button loading={saving === "active"} onClick={() => submit("active")}>{t("admin.products.activate")}</Button>
            </>}
          </div>
        </div>
      </div>

      <Drawer open={!!addAttr} onClose={() => setAddAttr(null)} title={t("admin.products.form.attributes.addTitle")} side="center"
        footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setAddAttr(null)}>{t("common.cancel")}</Button><Button onClick={saveNewAttribute}>{t("common.save")}</Button></div>}>
        <p className="text-caption mb-3 text-ink-soft">{t("admin.products.form.attributes.addNote")}</p>
        {addAttr && <AttributeEditor def={addAttr} index={0} onChange={setAddAttr} />}
      </Drawer>
    </div>
  );
}
export type { CategoryRecord };
