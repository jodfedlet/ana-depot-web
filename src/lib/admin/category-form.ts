import type { AdminAttribute, AdminCategory, CategoryRequest } from "../api/admin/dto";
import { keyOf, slugify } from "./slug";

/**
 * Form state of the category editor and its mapping to the API's `CategoryRequest`. Ids of existing attributes and options are KEPT, because products point
 * at them (the server refuses to drop an attribute or option that products use). `key`/`code` of saved items are frozen: they appear in storefront filter URLs.
 */
export interface FormOption { uid: string; id?: string; code: string; fr: string; ht: string; active: boolean }
export interface FormAttribute {
  uid: string; id?: string; key: string; fr: string; ht: string; type: "CHOICE" | "TEXT" | "NUMBER"; unit: string; required: boolean; filterable: boolean; variantAxis: boolean; active: boolean; options: FormOption[];
}
export interface CategoryForm {
  id?: string; version?: number; slug: string; nameFr: string; nameHt: string; descFr: string; descHt: string; imageUrl: string | null; active: boolean; attributes: FormAttribute[];
}

let counter = 0;
const uid = () => `u${Date.now().toString(36)}${(counter++).toString(36)}`;

export const emptyCategoryForm = (): CategoryForm => ({ slug: "", nameFr: "", nameHt: "", descFr: "", descHt: "", imageUrl: null, active: false, attributes: [] });
export const emptyAttribute = (): FormAttribute => ({ uid: uid(), key: "", fr: "", ht: "", type: "CHOICE", unit: "", required: false, filterable: false, variantAxis: false, active: true, options: [] });
export const emptyOption = (): FormOption => ({ uid: uid(), code: "", fr: "", ht: "", active: true });

const fromAttribute = (a: AdminAttribute): FormAttribute => ({
  uid: a.id, id: a.id, key: a.key, fr: a.label.fr ?? "", ht: a.label.ht ?? "", type: a.type, unit: a.unit ?? "", required: a.required, filterable: a.filterable, variantAxis: a.variantAxis, active: a.active,
  options: [...a.options].sort((x, y) => x.displayOrder - y.displayOrder).map((o) => ({ uid: o.id, id: o.id, code: o.code, fr: o.label.fr ?? "", ht: o.label.ht ?? "", active: o.active })),
});

export const categoryToForm = (c: AdminCategory): CategoryForm => ({
  id: c.id, version: c.version, slug: c.slug, nameFr: c.name.fr ?? "", nameHt: c.name.ht ?? "", descFr: c.description.fr ?? "", descHt: c.description.ht ?? "", imageUrl: c.imageUrl, active: c.active,
  attributes: [...c.attributes].sort((x, y) => x.displayOrder - y.displayOrder).map(fromAttribute),
});

/** The request the form stands for. Keys/codes/slugs left empty are derived from the labels (new items only); the server remains the validator. */
export function formToRequest(f: CategoryForm): CategoryRequest {
  return {
    version: f.id ? f.version : undefined,
    slug: f.slug.trim() || slugify(f.nameFr || f.nameHt),
    name: { fr: f.nameFr.trim(), ht: f.nameHt.trim() },
    description: { fr: f.descFr.trim(), ht: f.descHt.trim() },
    imageUrl: f.imageUrl,
    active: f.active,
    attributes: f.attributes.map((a, i) => ({
      id: a.id,
      key: a.key.trim() || keyOf(a.fr || a.ht),
      label: { fr: a.fr.trim(), ht: a.ht.trim() },
      type: a.type,
      unit: a.type === "NUMBER" && a.unit.trim() ? a.unit.trim() : null,
      required: a.required,
      filterable: a.type === "CHOICE" && a.filterable,
      variantAxis: a.type === "CHOICE" && a.variantAxis,
      displayOrder: i + 1,
      active: a.active,
      options: a.type === "CHOICE" ? a.options.map((o, j) => ({ id: o.id, code: o.code.trim() || slugify(o.fr || o.ht), label: { fr: o.fr.trim(), ht: o.ht.trim() }, displayOrder: j + 1, active: o.active })) : [],
    })),
  };
}

/** Maps a server field path (`attributes[1].options[0].code`) to the form's own keys so the right input can show the message. */
export const attributeFieldKey = (index: number, field: string) => `attributes[${index}].${field}`;
export const optionFieldKey = (index: number, option: number, field: string) => `attributes[${index}].options[${option}].${field}`;
