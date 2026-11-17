"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { ActionError, AdminErrorState } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLText, useT } from "@/i18n/provider";
import { type CategoryForm, categoryToForm, emptyAttribute, emptyCategoryForm, formToRequest } from "@/lib/admin/category-form";
import { slugify } from "@/lib/admin/slug";
import type { AdminCategory, AdminCategorySummary, CategoryProductLine, PageDto } from "@/lib/api/admin/dto";
import { createCategory, getCategory, listAllCategories, listCategoryProducts, moveCategoryProducts, reorderCategories, setCategoryActive, updateCategory } from "@/lib/api/admin/endpoints";
import { useAction, useAdminResource } from "@/lib/api/admin/hooks";
import { announceAdminChange } from "@/lib/api/admin/signals";
import { attemptKey, endAttempt } from "@/lib/api/idempotency";
import { fieldProblems, isTransientError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useUnsavedChanges } from "../admin-shell";
import { AttributeEditor } from "./attribute-editor";

export function CategoryList() {
  const t = useT();
  const lt = useLText();
  const toast = useToast();
  const res = useAdminResource("categories:all", (signal) => listAllCategories(signal));
  const action = useAction();
  const [confirm, setConfirm] = useState<AdminCategorySummary | null>(null);
  const [reason, setReason] = useState("");
  const name = (c: AdminCategorySummary) => lt({ fr: c.name.fr ?? "", ht: c.name.ht ?? "" }) || c.slug;

  if (res.error != null && !res.data) return <AdminErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Skeleton className="h-64 w-full" />;
  const items = res.data; // the server's display order

  const move = async (i: number, d: -1 | 1) => {
    const ids = items.map((c) => c.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    const r = await action.run(() => reorderCategories(ids));
    if (r.ok) { toast.show({ tone: "success", message: t("adminCat.reordered") }); announceAdminChange(); res.reload(); }
  };
  const toggle = async () => {
    if (!confirm) return;
    const r = await action.run(() => setCategoryActive(confirm.id, !confirm.active, reason.trim() || undefined));
    if (r.ok) { toast.show({ tone: "success", message: t(confirm.active ? "adminCat.deactivated" : "adminCat.activated") }); setConfirm(null); setReason(""); announceAdminChange(); res.reload(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-label font-normal text-ink-soft">{t("admin.categories.count", { count: items.length })}</p>
        <ButtonLink href="/admin/categories/new"><Plus aria-hidden className="size-4" />{t("admin.categories.new")}</ButtonLink>
      </div>
      <p className="text-caption text-ink-soft">{t("admin.categories.inactiveNote")}</p>
      {action.error != null && !confirm && <ActionError error={action.error} onReload={res.reload} />}
      {items.length === 0 ? (
        <div className="rounded-card border border-line bg-surface"><EmptyState title={t("admin.categories.emptyTitle")} description={t("admin.categories.emptyText")}><ButtonLink href="/admin/categories/new">{t("admin.categories.new")}</ButtonLink></EmptyState></div>
      ) : (
        <ul aria-busy={res.loading || action.pending} className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {items.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-label font-semibold">{name(c)}</p>
                <p className="text-caption text-ink-soft">{t("adminCat.counts", { products: c.productCount, active: c.activeProductCount, attributes: c.attributeCount })}</p>
              </div>
              <Badge tone={c.active ? "success" : "neutral"}>{c.active ? t("admin.categories.active") : t("admin.categories.inactive")}</Badge>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={i === 0 || action.pending} onClick={() => move(i, -1)} aria-label={`${t("admin.categories.moveUp")} — ${name(c)}`}><ArrowUp aria-hidden className="size-4" /></Button>
                <Button variant="ghost" size="sm" disabled={i === items.length - 1 || action.pending} onClick={() => move(i, 1)} aria-label={`${t("admin.categories.moveDown")} — ${name(c)}`}><ArrowDown aria-hidden className="size-4" /></Button>
                <ButtonLink href={`/admin/categories/${c.id}`} variant="outline" size="sm">{t("admin.products.edit")}</ButtonLink>
                <Button variant="outline" size="sm" onClick={() => { action.clear(); setConfirm(c); }}>{c.active ? t("admin.products.deactivate") : t("admin.products.activate")}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Drawer open={confirm !== null} onClose={() => setConfirm(null)} title={confirm?.active ? t("adminCat.deactivateTitle") : t("adminCat.activateTitle")} side="center"
        footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setConfirm(null)} disabled={action.pending}>{t("adminCommon.cancel")}</Button><Button variant={confirm?.active ? "danger" : "primary"} loading={action.pending} onClick={toggle}>{t("adminCommon.confirm")}</Button></div>}>
        <p className="text-label font-normal text-ink-soft">{confirm?.active ? t("adminCat.deactivateText") : t("adminCat.activateText")}</p>
        <TextField className="mt-4" label={t("adminCat.reasonOptional")} value={reason} onChange={(e) => setReason(e.target.value)} />
        {action.error != null && <div className="mt-4"><ActionError error={action.error} onReload={() => { setConfirm(null); res.reload(); }} /></div>}
      </Drawer>
    </div>
  );
}

export function CategoryEditor({ id }: { id?: string }) {
  const t = useT();
  const res = useAdminResource(id ? `category:${id}` : null, (signal) => getCategory(id as string, { signal }));
  const all = useAdminResource("categories:all", (signal) => listAllCategories(signal));
  if (!id) return <CategoryFormView key="new" initial={emptyCategoryForm()} categories={all.data ?? []} onReload={() => undefined} />;
  if (res.error != null && !res.data) return <AdminErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Skeleton className="h-96 w-full" />;
  // `key` = id + version: a reload after a conflict (or a save) rebuilds the form from the server's current data.
  return <CategoryFormView key={`${res.data.id}:${res.data.version}`} initial={categoryToForm(res.data)} saved={res.data} categories={all.data ?? []} onReload={res.reload} loadingLabel={t("adminCommon.loading")} />;
}

function CategoryFormView({ initial, saved, categories, onReload }: { initial: CategoryForm; saved?: AdminCategory; categories: AdminCategorySummary[]; onReload: () => void; loadingLabel?: string }) {
  const t = useT();
  const router = useLocaleRouter();
  const toast = useToast();
  const action = useAction();
  const [f, setF] = useState<CategoryForm>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [slugTouched, setSlugTouched] = useState(initial.id !== undefined);
  const dirty = JSON.stringify(f) !== baseline;
  useUnsavedChanges(dirty);
  const problems = fieldProblems(action.error);
  const fe = (field: string) => (problems[field] ? t(`fieldErrors.${problems[field] in FIELD_MSG ? problems[field] : "invalid"}` as never) : undefined);

  const save = async () => {
    const body = formToRequest(f);
    const scope = `category:${f.id ?? "new"}`;
    const key = attemptKey(scope, body);
    const r = await action.run(() => (f.id ? updateCategory(f.id, body, { idempotencyKey: key }) : createCategory(body, { idempotencyKey: key })));
    if (!r.ok) { if (!isTransientError(r.error)) endAttempt(scope); window.setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid='true'], [role='alert']")?.scrollIntoView({ block: "center" })); return; }
    endAttempt(scope);
    setBaseline(JSON.stringify(f));
    toast.show({ tone: "success", message: t(f.id ? "adminCat.saved" : "adminCat.created") });
    announceAdminChange();
    if (f.id) onReload(); else router.replace(`/admin/categories/${r.value.id}`);
  };

  const attrs = f.attributes;
  const setAttr = (i: number, next: CategoryForm["attributes"][number]) => setF((x) => ({ ...x, attributes: x.attributes.map((a, n) => (n === i ? next : a)) }));
  const moveAttr = (i: number, d: -1 | 1) => setF((x) => { const j = i + d; if (j < 0 || j >= x.attributes.length) return x; const a = [...x.attributes]; [a[i], a[j]] = [a[j], a[i]]; return { ...x, attributes: a }; });

  return (
    <div className="pb-28">
      <header className="mb-6">
        <Link href="/admin/categories" className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">← {t("admin.categories.backToList")}</Link>
        <h1 className="text-h1 mt-2">{f.id ? t("admin.categories.form.titleEdit") : t("admin.categories.form.titleNew")}</h1>
        {saved && <p className="text-caption mt-1 text-ink-soft">{t("adminCat.counts", { products: saved.productCount, active: saved.activeProductCount, attributes: saved.attributes.length })}</p>}
      </header>
      <div className="max-w-4xl space-y-6">
        {action.error != null && <ActionError error={action.error} onReload={onReload} fieldLabel={(field) => fieldLabel(t, field)} />}
        <section className="space-y-4 rounded-card border border-line bg-surface p-5 sm:p-6" aria-label={t("admin.categories.form.general")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t("admin.categories.form.nameFr")} lang="fr" value={f.nameFr} onChange={(e) => setF({ ...f, nameFr: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })} error={fe("name.fr")} />
            <TextField label={t("admin.categories.form.nameHt")} lang="ht" value={f.nameHt} onChange={(e) => setF({ ...f, nameHt: e.target.value })} error={fe("name.ht")} />
            <TextField label={t("adminCat.slug")} value={f.slug} hint={t("adminCat.slugHint")} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value }); }} error={fe("slug")} className="sm:col-span-2" />
            <TextAreaField label={t("admin.categories.form.descFr")} lang="fr" optional rows={3} value={f.descFr} onChange={(e) => setF({ ...f, descFr: e.target.value })} />
            <TextAreaField label={t("admin.categories.form.descHt")} lang="ht" optional rows={3} value={f.descHt} onChange={(e) => setF({ ...f, descHt: e.target.value })} />
          </div>
          <Checkbox label={t("admin.categories.form.activeToggle")} description={t("admin.categories.inactiveNote")} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        </section>

        <section className="space-y-4 rounded-card border border-line bg-surface p-5 sm:p-6" aria-labelledby="attrs-t">
          <div><h2 id="attrs-t" className="text-h3">{t("admin.categories.form.attributes.title")}</h2><p className="text-caption mt-0.5 text-ink-soft">{t("admin.categories.form.attributes.hint")}</p></div>
          {attrs.length === 0 && <Alert tone="info">{t("admin.categories.form.attributes.empty")}</Alert>}
          <ul className="space-y-4">
            {attrs.map((a, i) => <li key={a.uid}><AttributeEditor def={a} index={i} errors={problems} onChange={(next) => setAttr(i, next)} onRemove={() => setF((x) => ({ ...x, attributes: x.attributes.filter((_, n) => n !== i) }))} onMove={(d) => moveAttr(i, d)} /></li>)}
          </ul>
          <Button variant="outline" onClick={() => setF((x) => ({ ...x, attributes: [...x.attributes, emptyAttribute()] }))}><Plus aria-hidden className="size-4" />{t("admin.categories.form.attributes.add")}</Button>
        </section>

        {saved && <CategoryProducts category={saved} categories={categories} />}
      </div>

      <div role="region" aria-label={t("admin.products.form.actions")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-float backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className={cn("text-label", dirty ? "font-semibold text-warning-fg" : "font-normal text-ink-soft")} role="status">{dirty ? t("admin.pickupSettings.unsaved.bar") : t("admin.products.form.upToDate")}</p>
          <div className="flex gap-2"><ButtonLink href="/admin/categories" variant="ghost">{t("common.cancel")}</ButtonLink><Button loading={action.pending} onClick={save}>{t("common.save")}</Button></div>
        </div>
      </div>
    </div>
  );
}

const FIELD_MSG: Record<string, true> = { required: true, invalid: true, too_long: true, required_to_publish: true, duplicate_slug: true };
function fieldLabel(t: ReturnType<typeof useT>, field: string): string {
  const attr = /^attributes\[(\d+)\]\.options\[(\d+)\]\.(.+)$/.exec(field);
  if (attr) return t("adminCat.optionPath", { n: Number(attr[1]) + 1, m: Number(attr[2]) + 1, field: attr[3] });
  const a = /^attributes\[(\d+)\]\.(.+)$/.exec(field);
  if (a) return t("adminCat.attrPath", { n: Number(a[1]) + 1, field: a[2] });
  return field === "slug" ? t("adminCat.fields.slug") : field === "name.fr" ? t("adminCat.fields.name.fr" as never) : field === "name.ht" ? t("adminCat.fields.name.ht" as never) : field;
}

/** Products of the category (every status) with selection and an all-or-nothing move to another category. */
function CategoryProducts({ category, categories }: { category: AdminCategory; categories: AdminCategorySummary[] }) {
  const t = useT();
  const lt = useLText();
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const action = useAction();
  const res = useAdminResource(`category-products:${category.id}:${page}`, (signal) => listCategoryProducts(category.id, { page, size: 20 }, { signal }));
  const [version, setVersion] = useState(0);
  const loaded = useRef<PageDto<CategoryProductLine> | undefined>(undefined);
  useEffect(() => { loaded.current = res.data; }, [res.data]);
  const refresh = useCallback(() => { setVersion((n) => n + 1); res.reload(); }, [res]);
  void version;
  const items = res.data?.items ?? [];
  const others = categories.filter((c) => c.id !== category.id);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const move = async () => {
    const r = await action.run(() => moveCategoryProducts(category.id, target, [...selected]));
    if (r.ok) { toast.show({ tone: "success", message: t("adminCat.moved", { count: r.value.moved }) }); setSelected(new Set()); announceAdminChange(); refresh(); }
  };

  return (
    <section className="space-y-3 rounded-card border border-line bg-surface p-5 sm:p-6" aria-labelledby="cp-t">
      <h2 id="cp-t" className="text-h3">{t("adminCat.productsTitle")}</h2>
      {res.error != null && !res.data ? <AdminErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Skeleton className="h-24 w-full" /> : items.length === 0 ? <p className="text-label font-normal text-ink-soft">{t("adminCat.productsEmpty")}</p> : (
        <>
          <ul className="divide-y divide-line rounded-control border border-line">
            {items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Checkbox label={<span className="sr-only">{t("adminCat.selectProducts")} — {lt({ fr: p.name.fr ?? "", ht: p.name.ht ?? "" })}</span>} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <div className="min-w-0 flex-1"><p className="text-label font-semibold">{lt({ fr: p.name.fr ?? "", ht: p.name.ht ?? "" })}</p><p className="text-caption text-ink-soft">{p.sku} · {p.currencies.join(" / ") || "—"}</p></div>
                <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{t(`adminCat.productStatus.${p.status as "ACTIVE"}`)}</Badge>
                <ButtonLink href={`/admin/products/${p.id}`} variant="ghost" size="sm">{t("adminCat.productsOpen")}</ButtonLink>
              </li>
            ))}
          </ul>
          {res.data.totalPages > 1 && (
            <nav className="flex items-center justify-between gap-3" aria-label={t("adminCommon.page", { page: page + 1, count: res.data.totalPages })}>
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("adminCommon.previous")}</Button>
              <span className="text-caption text-ink-soft">{t("adminCommon.page", { page: page + 1, count: res.data.totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= res.data.totalPages} onClick={() => setPage((p) => p + 1)}>{t("adminCommon.next")}</Button>
            </nav>
          )}
          <div className="rounded-control border border-line bg-sand-50 p-3">
            <p className="text-label font-semibold">{t("adminCat.moveTitle")}</p>
            <p className="text-caption mt-0.5 text-ink-soft">{t("adminCat.moveHint")}</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <SelectField label={t("adminCat.moveTo")} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">—</option>
                {others.map((c) => <option key={c.id} value={c.id}>{lt({ fr: c.name.fr ?? "", ht: c.name.ht ?? "" }) || c.slug}{c.active ? "" : ` (${t("admin.categories.inactive")})`}</option>)}
              </SelectField>
              <Button loading={action.pending} disabled={selected.size === 0 || !target} onClick={move}>{t("adminCat.moveAction", { count: selected.size })}</Button>
            </div>
            {action.error != null && <div className="mt-3"><ActionError error={action.error} onReload={refresh} /></div>}
          </div>
        </>
      )}
    </section>
  );
}
