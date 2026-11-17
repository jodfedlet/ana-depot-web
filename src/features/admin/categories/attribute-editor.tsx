"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import { fieldErrorKey } from "@/lib/api/errors";
import { type FormAttribute, attributeFieldKey, emptyOption, optionFieldKey } from "@/lib/admin/category-form";
import { keyOf, slugify } from "@/lib/admin/slug";

const TYPES = ["CHOICE", "TEXT", "NUMBER"] as const;
const typeKey = { CHOICE: "select", TEXT: "text", NUMBER: "number" } as const;

/** Edits ONE attribute definition of a category. Saved items keep their key/code (they appear in storefront URLs and products point at them). */
export function AttributeEditor({ def, onChange, errors, index, onRemove, onMove }: {
  def: FormAttribute;
  onChange: (next: FormAttribute) => void;
  /** Server field problems keyed by the server's field path (e.g. `attributes[0].label.fr`). */
  errors: Record<string, string>;
  index: number;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useT();
  const err = (field: string) => { const c = errors[attributeFieldKey(index, field)]; return c ? t(fieldErrorKey(c)) : undefined; };
  const optErr = (j: number, field: string) => { const c = errors[optionFieldKey(index, j, field)]; return c ? t(fieldErrorKey(c)) : undefined; };
  const setOption = (i: number, patch: Partial<FormAttribute["options"][number]>) => onChange({ ...def, options: def.options.map((o, n) => (n === i ? { ...o, ...patch } : o)) });
  const saved = def.id !== undefined;
  return (
    <fieldset className="space-y-4 rounded-card border border-line bg-surface p-4">
      <legend className="sr-only">{t("admin.categories.form.attributes.item", { n: index + 1 })}</legend>
      <div className="flex items-center justify-between gap-2">
        <p className="text-label font-semibold">{t("admin.categories.form.attributes.item", { n: index + 1 })}</p>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => onMove(-1)} aria-label={t("admin.categories.form.attributes.moveUp")}><ArrowUp aria-hidden className="size-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => onMove(1)} aria-label={t("admin.categories.form.attributes.moveDown")}><ArrowDown aria-hidden className="size-4" /></Button>
          {!saved && <Button variant="ghost" size="sm" onClick={onRemove} aria-label={t("admin.categories.form.attributes.remove")}><Trash2 aria-hidden className="size-4" /></Button>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("admin.categories.form.attributes.labelFr")} lang="fr" value={def.fr} onChange={(ev) => onChange({ ...def, fr: ev.target.value })} error={err("label.fr")} />
        <TextField label={t("admin.categories.form.attributes.labelHt")} lang="ht" value={def.ht} onChange={(ev) => onChange({ ...def, ht: ev.target.value })} error={err("label.ht")} />
        <TextField label={t("adminCat.key")} value={def.key || (saved ? "" : keyOf(def.fr || def.ht))} readOnly={saved} hint={t("adminCat.keyHint")} onChange={(ev) => onChange({ ...def, key: ev.target.value })} error={err("key")} />
        <SelectField label={t("admin.categories.form.attributes.type")} value={def.type} onChange={(ev) => { const type = ev.target.value as FormAttribute["type"]; onChange({ ...def, type, filterable: type === "CHOICE" && def.filterable, variantAxis: type === "CHOICE" && def.variantAxis }); }} error={err("type")}>
          {TYPES.map((x) => <option key={x} value={x}>{t(`admin.categories.form.attributes.types.${typeKey[x]}`)}</option>)}
        </SelectField>
        {def.type === "NUMBER" && <TextField label={t("admin.categories.form.attributes.unit")} optional value={def.unit} onChange={(ev) => onChange({ ...def, unit: ev.target.value })} />}
      </div>
      {def.type === "CHOICE" && (
        <div>
          <p className="text-label mb-2 font-semibold">{t("admin.categories.form.attributes.options")}</p>
          {err("options") && <p role="alert" className="text-caption mb-2 font-medium text-danger-fg">{err("options")}</p>}
          <ul className="space-y-3">
            {def.options.map((o, i) => (
              <li key={o.uid} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <TextField label={t("admin.categories.form.attributes.optionFr")} lang="fr" value={o.fr} onChange={(ev) => setOption(i, { fr: ev.target.value })} error={optErr(i, "label.fr")} />
                <TextField label={t("admin.categories.form.attributes.optionHt")} lang="ht" value={o.ht} onChange={(ev) => setOption(i, { ht: ev.target.value })} error={optErr(i, "label.ht")} />
                <TextField label={t("adminCat.code")} value={o.code || (o.id ? "" : slugify(o.fr || o.ht))} readOnly={o.id !== undefined} onChange={(ev) => setOption(i, { code: ev.target.value })} error={optErr(i, "code")} />
                <div className="flex items-center gap-2 pb-1">
                  {o.id !== undefined && <Checkbox label={t("adminCat.optionActive")} checked={o.active} onChange={(ev) => setOption(i, { active: ev.target.checked })} />}
                  {o.id === undefined && <Button variant="ghost" size="sm" onClick={() => onChange({ ...def, options: def.options.filter((_, n) => n !== i) })} aria-label={t("admin.categories.form.attributes.removeOption")}><Trash2 aria-hidden className="size-4" /></Button>}
                </div>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => onChange({ ...def, options: [...def.options, emptyOption()] })}><Plus aria-hidden className="size-4" />{t("admin.categories.form.attributes.addOption")}</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox label={t("admin.categories.form.attributes.required")} checked={def.required} onChange={(ev) => onChange({ ...def, required: ev.target.checked })} />
        {def.type === "CHOICE" && <Checkbox label={t("admin.categories.form.attributes.filterable")} checked={def.filterable} onChange={(ev) => onChange({ ...def, filterable: ev.target.checked })} />}
        {def.type === "CHOICE" && <Checkbox label={t("admin.categories.form.attributes.variantAxis")} checked={def.variantAxis} onChange={(ev) => onChange({ ...def, variantAxis: ev.target.checked })} />}
        {saved && <Checkbox label={t("adminCat.itemActive")} checked={def.active} onChange={(ev) => onChange({ ...def, active: ev.target.checked })} />}
      </div>
    </fieldset>
  );
}
