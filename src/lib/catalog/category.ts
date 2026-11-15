import { type LText, L } from "../localized";
import { slugify } from "./draft";
import type { AttributeDef, CategoryRecord } from "./model";

export const emptyCategory = (order: number): CategoryRecord => ({ slug: "", name: L("", ""), description: L("", ""), active: true, order, attributes: [] });

export const emptyAttribute = (): AttributeDef => ({ key: "", label: L("", ""), type: "select", options: [], filterable: false, required: false, variantAxis: false });

export function attributeKey(label: LText, taken: string[]): string {
  const root = slugify(label.fr || label.ht).replace(/-/g, "_") || "attr";
  if (!taken.includes(root)) return root;
  let i = 2;
  while (taken.includes(`${root}_${i}`)) i += 1;
  return `${root}_${i}`;
}

export type CategoryErrors = Record<string, string>;

/** Error values are message keys under admin.categories.errors.*. Attribute errors are keyed attr.<index>.<field>. */
export function validateCategory(c: CategoryRecord, otherSlugs: string[]): CategoryErrors {
  const e: CategoryErrors = {};
  if (!c.name.fr.trim() && !c.name.ht.trim()) e.name = "nameRequired";
  if (c.slug && otherSlugs.includes(c.slug)) e.name = "slugDuplicate";
  c.attributes.forEach((a, i) => {
    if (!a.label.fr.trim() && !a.label.ht.trim()) e[`attr.${i}.label`] = "labelRequired";
    if (a.type === "select") {
      if (a.options.length === 0) e[`attr.${i}.options`] = "optionsRequired";
      else if (a.options.some((o) => !o.label.fr.trim() && !o.label.ht.trim())) e[`attr.${i}.options`] = "optionLabelRequired";
    }
    if (a.type !== "select" && (a.filterable || a.variantAxis)) e[`attr.${i}.type`] = "selectOnly";
  });
  return e;
}
