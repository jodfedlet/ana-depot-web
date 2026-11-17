import { describe, expect, it } from "vitest";
import type { AdminCategory } from "../api/admin/dto";
import { categoryToForm, emptyAttribute, emptyCategoryForm, emptyOption, formToRequest } from "./category-form";
import { keyOf, slugify } from "./slug";

const saved: AdminCategory = {
  id: "c1", slug: "vetements", name: { fr: "Vêtements", ht: "Rad" }, description: { fr: "", ht: "" }, imageUrl: null, active: true, displayOrder: 2, version: 4, createdAt: "", updatedAt: "", productCount: 3, activeProductCount: 2,
  attributes: [{ id: "a1", key: "size", label: { fr: "Taille", ht: "Gwosè" }, type: "CHOICE", unit: null, required: false, filterable: true, variantAxis: true, displayOrder: 1, active: true, valueCount: 3,
    options: [{ id: "o1", code: "s", label: { fr: "S", ht: "S" }, displayOrder: 1, active: true, useCount: 2 }, { id: "o2", code: "m", label: { fr: "M", ht: "M" }, displayOrder: 2, active: true, useCount: 0 }] }],
};

describe("category form <-> API request (MOCKED shapes)", () => {
  it("keeps ids, version and keys of saved items so products keep pointing at them", () => {
    const req = formToRequest(categoryToForm(saved));
    expect(req.version).toBe(4);
    expect(req.attributes[0]).toMatchObject({ id: "a1", key: "size", filterable: true, variantAxis: true });
    expect(req.attributes[0].options?.map((o) => [o.id, o.code])).toEqual([["o1", "s"], ["o2", "m"]]);
  });
  it("a new category has no version; slug, keys and codes are proposed from the labels", () => {
    const f = emptyCategoryForm();
    f.nameFr = "Électroménager";
    const a = { ...emptyAttribute(), fr: "Matière", type: "CHOICE" as const };
    a.options = [{ ...emptyOption(), fr: "Acier inox" }];
    f.attributes = [a];
    const req = formToRequest(f);
    expect(req.version).toBeUndefined();
    expect(req.slug).toBe("electromenager");
    expect(req.attributes[0].key).toBe("matiere");
    expect(req.attributes[0].options?.[0].code).toBe("acier-inox");
  });
  it("only CHOICE attributes carry options, filters and variant axes; units only for numbers", () => {
    const f = categoryToForm(saved);
    f.attributes[0].type = "NUMBER";
    f.attributes[0].unit = "cm";
    const a = formToRequest(f).attributes[0];
    expect(a).toMatchObject({ type: "NUMBER", unit: "cm", filterable: false, variantAxis: false, options: [] });
  });
  it("display order follows the position on screen", () => {
    const f = categoryToForm(saved);
    f.attributes.push({ ...emptyAttribute(), fr: "Couleur" });
    expect(formToRequest(f).attributes.map((x) => x.displayOrder)).toEqual([1, 2]);
  });
  it("attribute keys follow the API rule [a-z][a-z0-9_]* (underscores, starting with a letter)", () => {
    expect(keyOf("Couleur E2E")).toBe("couleur_e2e");
    expect(keyOf("2 Tailles")).toBe("tailles");
    expect(/^[a-z][a-z0-9_]{0,59}$/.test(keyOf("Matière première (kg)"))).toBe(true);
  });
  it("slugify folds accents and keeps [a-z0-9-]", () => {
    expect(slugify("  Câble d'alimentation (2 m) ")).toBe("cable-d-alimentation-2-m");
    expect(slugify("Ça/été")).toBe("ca-ete");
  });
});
