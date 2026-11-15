"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, SelectField, TextField } from "@/components/ui/field";
import { useT } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { L } from "@/lib/localized";
import type { AttributeDef, AttributeType } from "@/lib/catalog/model";

const TYPES: AttributeType[] = ["select", "text", "number"];

/** Edits ONE attribute definition of a category (label, type, choices, filter/required/variant flags). */
export function AttributeEditor({ def, onChange, errors, index, onRemove, onMove }: {
  def: AttributeDef;
  onChange: (next: AttributeDef) => void;
  errors?: Record<string, string>;
  index: number;
  onRemove?: () => void;
  onMove?: (dir: -1 | 1) => void;
}) {
  const t = useT();
  const e = (k: string) => (errors?.[`attr.${index}.${k}`] ? t(`admin.categories.errors.${errors[`attr.${index}.${k}`]}` as MessageKey) : undefined);
  const setOption = (i: number, lang: "fr" | "ht", v: string) => onChange({ ...def, options: def.options.map((o, n) => (n === i ? { ...o, label: { ...o.label, [lang]: v } } : o)) });
  const addOption = () => onChange({ ...def, options: [...def.options, { id: `o${Date.now().toString(36)}${def.options.length}`, label: L("", "") }] });
  return (
    <fieldset className="space-y-4 rounded-card border border-line bg-surface p-4">
      <legend className="sr-only">{t("admin.categories.form.attributes.item", { n: index + 1 })}</legend>
      <div className="flex items-center justify-between gap-2">
        <p className="text-label font-semibold">{t("admin.categories.form.attributes.item", { n: index + 1 })}</p>
        <div className="flex gap-1">
          {onMove && <><Button variant="ghost" size="sm" onClick={() => onMove(-1)} aria-label={t("admin.categories.form.attributes.moveUp")}><ArrowUp aria-hidden className="size-4" /></Button><Button variant="ghost" size="sm" onClick={() => onMove(1)} aria-label={t("admin.categories.form.attributes.moveDown")}><ArrowDown aria-hidden className="size-4" /></Button></>}
          {onRemove && <Button variant="ghost" size="sm" onClick={onRemove} aria-label={t("admin.categories.form.attributes.remove")}><Trash2 aria-hidden className="size-4" /></Button>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("admin.categories.form.attributes.labelFr")} lang="fr" value={def.label.fr} onChange={(ev) => onChange({ ...def, label: { ...def.label, fr: ev.target.value } })} error={e("label")} />
        <TextField label={t("admin.categories.form.attributes.labelHt")} lang="ht" value={def.label.ht} onChange={(ev) => onChange({ ...def, label: { ...def.label, ht: ev.target.value } })} />
        <SelectField label={t("admin.categories.form.attributes.type")} value={def.type} onChange={(ev) => { const type = ev.target.value as AttributeType; onChange({ ...def, type, filterable: type === "select" ? def.filterable : false, variantAxis: type === "select" ? def.variantAxis : false }); }}>
          {TYPES.map((x) => <option key={x} value={x}>{t(`admin.categories.form.attributes.types.${x}`)}</option>)}
        </SelectField>
        {def.type === "number" && <TextField label={t("admin.categories.form.attributes.unit")} optional value={def.unit ?? ""} onChange={(ev) => onChange({ ...def, unit: ev.target.value || undefined })} />}
      </div>
      {def.type === "select" && (
        <div>
          <p className="text-label mb-2 font-semibold">{t("admin.categories.form.attributes.options")}</p>
          {e("options") && <p role="alert" className="text-caption mb-2 font-medium text-danger-fg">{e("options")}</p>}
          <ul className="space-y-2">
            {def.options.map((o, i) => (
              <li key={o.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <TextField label={t("admin.categories.form.attributes.optionFr")} lang="fr" value={o.label.fr} onChange={(ev) => setOption(i, "fr", ev.target.value)} />
                <TextField label={t("admin.categories.form.attributes.optionHt")} lang="ht" value={o.label.ht} onChange={(ev) => setOption(i, "ht", ev.target.value)} />
                <Button variant="ghost" size="sm" className="mb-1" onClick={() => onChange({ ...def, options: def.options.filter((_, n) => n !== i) })} aria-label={t("admin.categories.form.attributes.removeOption")}><Trash2 aria-hidden className="size-4" /></Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="mt-2" onClick={addOption}><Plus aria-hidden className="size-4" />{t("admin.categories.form.attributes.addOption")}</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox label={t("admin.categories.form.attributes.required")} checked={def.required} onChange={(ev) => onChange({ ...def, required: ev.target.checked })} />
        {def.type === "select" && <Checkbox label={t("admin.categories.form.attributes.filterable")} checked={def.filterable} onChange={(ev) => onChange({ ...def, filterable: ev.target.checked })} />}
        {def.type === "select" && <Checkbox label={t("admin.categories.form.attributes.variantAxis")} checked={def.variantAxis} onChange={(ev) => onChange({ ...def, variantAxis: ev.target.checked })} />}
      </div>
      {e("type") && <p role="alert" className="text-caption font-medium text-danger-fg">{e("type")}</p>}
    </fieldset>
  );
}
