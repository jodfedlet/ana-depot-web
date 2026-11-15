"use client";

import { ArrowDown, ArrowUp, ImagePlus, Images, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox, TextAreaField, TextField } from "@/components/ui/field";
import Image from "@/components/ui/smart-image";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLText, useT } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { moveCategory, saveCategory, setCategoryActive } from "@/lib/api/catalog-admin";
import { emptyAttribute, emptyCategory } from "@/lib/catalog/category";
import { readImageFile } from "@/lib/catalog/images";
import type { CategoryRecord } from "@/lib/catalog/model";
import { cn } from "@/lib/cn";
import { useCatalogState } from "@/lib/stores/catalog-store";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { useUnsavedChanges } from "../admin-shell";
import { AttributeEditor } from "./attribute-editor";

export function CategoryList() {
  const t = useT();
  const lt = useLText();
  const toast = useToast();
  const ready = useIsClient();
  const { categories, products } = useCatalogState();
  const [busy, setBusy] = useState<string | null>(null);
  if (!ready) return <Skeleton className="h-64 w-full" />;
  const sorted = [...categories].sort((a, b) => a.order - b.order);

  const toggle = async (c: CategoryRecord) => {
    setBusy(c.slug);
    await setCategoryActive(c.slug, !c.active);
    setBusy(null);
    toast.show({ tone: "success", message: c.active ? t("admin.categories.toasts.deactivated") : t("admin.categories.toasts.activated") });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-label font-normal text-ink-soft">{t("admin.categories.count", { count: sorted.length })}</p>
        <ButtonLink href="/admin/categories/new"><Plus aria-hidden className="size-4" />{t("admin.categories.new")}</ButtonLink>
      </div>
      <p className="text-caption text-ink-soft">{t("admin.categories.inactiveNote")}</p>
      {sorted.length === 0 ? (
        <div className="rounded-card border border-line bg-surface"><EmptyState title={t("admin.categories.emptyTitle")} description={t("admin.categories.emptyText")}><ButtonLink href="/admin/categories/new">{t("admin.categories.new")}</ButtonLink></EmptyState></div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {sorted.map((c, i) => {
            const count = products.filter((p) => p.categorySlug === c.slug).length;
            return (
              <li key={c.slug} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-control bg-sand-100"><Image src={c.image ?? "/sample/placeholder.svg"} alt="" fill sizes="56px" className="object-cover" /></div>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-label font-semibold">{lt(c.name)}</p>
                  <p className="text-caption text-ink-soft">{t("admin.categories.attributesCount", { count: c.attributes.length })} · {t("admin.categories.productsCount", { count })}</p>
                </div>
                <Badge tone={c.active ? "success" : "neutral"}>{c.active ? t("admin.categories.active") : t("admin.categories.inactive")}</Badge>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => moveCategory(c.slug, -1)} aria-label={`${t("admin.categories.moveUp")} — ${lt(c.name)}`}><ArrowUp aria-hidden className="size-4" /></Button>
                  <Button variant="ghost" size="sm" disabled={i === sorted.length - 1} onClick={() => moveCategory(c.slug, 1)} aria-label={`${t("admin.categories.moveDown")} — ${lt(c.name)}`}><ArrowDown aria-hidden className="size-4" /></Button>
                  <ButtonLink href={`/admin/categories/${c.slug}`} variant="outline" size="sm">{t("admin.products.edit")}</ButtonLink>
                  <Button variant="outline" size="sm" loading={busy === c.slug} onClick={() => toggle(c)}>{c.active ? t("admin.products.deactivate") : t("admin.products.activate")}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ImagePicker({ src, onChange }: { src?: string; onChange: (src?: string) => void }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string>();
  const samples = ["metal", "shoes", "bedding", "furniture", "household", "general"].map((s) => `/sample/categories/${s}.svg`);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative size-24 overflow-hidden rounded-card border border-line bg-sand-100"><Image src={src ?? "/sample/placeholder.svg"} alt="" fill sizes="96px" className="object-cover" /></div>
      <div className="flex flex-wrap gap-2">
        <input ref={ref} type="file" accept="image/*" className="sr-only" aria-label={t("admin.categories.form.imageUpload")} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { onChange(await readImageFile(f, 700)); setErr(undefined); } catch { setErr(t("admin.products.form.images.unreadable")); } }} />
        <Button variant="outline" onClick={() => ref.current?.click()}><ImagePlus aria-hidden className="size-4" />{t("admin.categories.form.imageUpload")}</Button>
        <Button variant="ghost" onClick={() => setOpen(true)}><Images aria-hidden className="size-4" />{t("admin.categories.form.imageSample")}</Button>
        {src && <Button variant="ghost" onClick={() => onChange(undefined)}>{t("admin.products.form.images.remove")}</Button>}
      </div>
      {err && <p role="alert" className="text-caption w-full font-medium text-danger-fg">{err}</p>}
      <Drawer open={open} onClose={() => setOpen(false)} title={t("admin.categories.form.imageSample")} side="center">
        <ul className="grid grid-cols-3 gap-2">{samples.map((s) => <li key={s}><button type="button" onClick={() => { onChange(s); setOpen(false); }} aria-label={s.split("/").pop()} className="relative block aspect-[4/3] w-full overflow-hidden rounded-control border border-line bg-sand-100 hover:border-ink-muted"><Image src={s} alt="" fill sizes="160px" className="object-cover" /></button></li>)}</ul>
      </Drawer>
    </div>
  );
}

export function CategoryEditor({ slug }: { slug?: string }) {
  const t = useT();
  const ready = useIsClient();
  const { categories } = useCatalogState();
  const existing = slug ? categories.find((c) => c.slug === slug) : undefined;
  if (!ready) return <Skeleton className="h-96 w-full" />;
  if (slug && !existing) return <EmptyState title={t("admin.categories.notFoundTitle")} description={t("admin.categories.notFoundText")}><ButtonLink href="/admin/categories">{t("admin.categories.backToList")}</ButtonLink></EmptyState>;
  return <CategoryForm key={existing ? JSON.stringify(existing).length + existing.slug : "new"} existing={existing} nextOrder={Math.max(0, ...categories.map((c) => c.order)) + 1} />;
}

function CategoryForm({ existing, nextOrder }: { existing?: CategoryRecord; nextOrder: number }) {
  const t = useT();
  const router = useLocaleRouter();
  const toast = useToast();
  const initial = useMemo(() => existing ?? emptyCategory(nextOrder), [existing, nextOrder]);
  const [rec, setRec] = useState<CategoryRecord>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(rec) !== baseline;
  useUnsavedChanges(dirty);
  const err = (k: string) => (errors[k] ? t(`admin.categories.errors.${errors[k]}` as MessageKey) : undefined);
  const setAttr = (i: number, next: CategoryRecord["attributes"][number]) => setRec((r) => ({ ...r, attributes: r.attributes.map((a, n) => (n === i ? next : a)) }));
  const moveAttr = (i: number, d: -1 | 1) => setRec((r) => { const j = i + d; if (j < 0 || j >= r.attributes.length) return r; const a = [...r.attributes]; [a[i], a[j]] = [a[j], a[i]]; return { ...r, attributes: a }; });

  const save = async () => {
    setSaving(true);
    const r = await saveCategory(rec, !existing);
    setSaving(false);
    if (!r.ok) { setErrors((r.errors as Record<string, string>) ?? {}); window.setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid='true'], [role='alert']")?.scrollIntoView({ block: "center" }), 50); return; }
    setErrors({});
    setBaseline(JSON.stringify(rec));
    toast.show({ tone: "success", message: `${t("admin.categories.toasts.saved")} ${t("admin.demo.saved")}` });
    router.push("/admin/categories");
  };

  return (
    <div className="pb-28">
      <header className="mb-6">
        <Link href="/admin/categories" className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">← {t("admin.categories.backToList")}</Link>
        <h1 className="text-h1 mt-2">{existing ? t("admin.categories.form.titleEdit") : t("admin.categories.form.titleNew")}</h1>
      </header>
      <div className="max-w-4xl space-y-6">
        <section className="space-y-4 rounded-card border border-line bg-surface p-5 sm:p-6" aria-label={t("admin.categories.form.general")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("admin.categories.form.nameFr")} lang="fr" value={rec.name.fr} onChange={(e) => setRec({ ...rec, name: { ...rec.name, fr: e.target.value } })} error={err("name")} />
            <TextField label={t("admin.categories.form.nameHt")} lang="ht" value={rec.name.ht} onChange={(e) => setRec({ ...rec, name: { ...rec.name, ht: e.target.value } })} />
            <TextAreaField label={t("admin.categories.form.descFr")} lang="fr" optional rows={3} value={rec.description.fr} onChange={(e) => setRec({ ...rec, description: { ...rec.description, fr: e.target.value } })} />
            <TextAreaField label={t("admin.categories.form.descHt")} lang="ht" optional rows={3} value={rec.description.ht} onChange={(e) => setRec({ ...rec, description: { ...rec.description, ht: e.target.value } })} />
          </div>
          <div><p className="text-label mb-2">{t("admin.categories.form.image")}</p><ImagePicker src={rec.image} onChange={(image) => setRec({ ...rec, image })} /></div>
          <Checkbox label={t("admin.categories.form.activeToggle")} description={t("admin.categories.inactiveNote")} checked={rec.active} onChange={(e) => setRec({ ...rec, active: e.target.checked })} />
        </section>

        <section className="space-y-4 rounded-card border border-line bg-surface p-5 sm:p-6" aria-labelledby="attrs-t">
          <div><h2 id="attrs-t" className="text-h3">{t("admin.categories.form.attributes.title")}</h2><p className="text-caption mt-0.5 text-ink-soft">{t("admin.categories.form.attributes.hint")}</p></div>
          {rec.attributes.length === 0 && <Alert tone="info">{t("admin.categories.form.attributes.empty")}</Alert>}
          <ul className="space-y-4">
            {rec.attributes.map((a, i) => (
              <li key={`${a.key}-${i}`}><AttributeEditor def={a} index={i} errors={errors} onChange={(next) => setAttr(i, next)} onRemove={() => setRec((r) => ({ ...r, attributes: r.attributes.filter((_, n) => n !== i) }))} onMove={(d) => moveAttr(i, d)} /></li>
            ))}
          </ul>
          <Button variant="outline" onClick={() => setRec((r) => ({ ...r, attributes: [...r.attributes, emptyAttribute()] }))}><Plus aria-hidden className="size-4" />{t("admin.categories.form.attributes.add")}</Button>
        </section>
      </div>

      <div role="region" aria-label={t("admin.products.form.actions")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-float backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className={cn("text-label", dirty ? "font-semibold text-warning-fg" : "font-normal text-ink-soft")} role="status">{dirty ? t("admin.pickupSettings.unsaved.bar") : t("admin.products.form.upToDate")}</p>
          <div className="flex gap-2"><ButtonLink href="/admin/categories" variant="ghost">{t("common.cancel")}</ButtonLink><Button loading={saving} onClick={save}>{t("common.save")}</Button></div>
        </div>
      </div>
    </div>
  );
}
