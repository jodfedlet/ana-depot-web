/**
 * Catalog administration API boundary (DEMO IMPLEMENTATION over the browser demo store).
 * Same contract style as reservations: async functions, validation inside, typed Results.
 * Replace the bodies with HTTP calls to the Spring Boot API; keep signatures and error codes.
 */
import { type CategoryErrors, validateCategory } from "../catalog/category";
import { type DraftErrors, type ProductDraft, draftToRecord, recordToDraft, uniqueSlug, validateDraft } from "../catalog/draft";
import { type CategoryRecord, type ProductRecord, type ProductStatus, type StockMovement, type StockMovementType, type StockReason, hasVariantsRecord } from "../catalog/model";
import { slugify } from "../catalog/draft";
import { catalogStore } from "../stores/catalog-store";

export type CatalogError = "validation" | "not_found" | "stock_negative" | "stock_invalid" | "category_in_use";
export type CatalogResult<T> = { ok: true; data: T } | { ok: false; error: CatalogError; errors?: DraftErrors | CategoryErrors };

const latency = (ms = 350) => new Promise<void>((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Create or update a product. Publishing (status "active") enforces every required field; drafts only need a name. */
export async function saveProduct(draft: ProductDraft, status: ProductStatus, staff: string): Promise<CatalogResult<{ id: string; slug: string }>> {
  await latency();
  const state = catalogStore.getSnapshot();
  const existing = draft.id ? state.products.find((p) => p.id === draft.id) : undefined;
  if (draft.id && !existing) return { ok: false, error: "not_found" };
  const category = state.categories.find((c) => c.slug === draft.categorySlug);
  const otherSkus = state.products.filter((p) => p.id !== draft.id).flatMap((p) => [p.sku, ...p.variants.map((v) => v.sku)]).filter(Boolean);
  const next = { ...draft, status };
  const errors = validateDraft(next, category, otherSkus, status === "active" ? "publish" : "draft");
  if (Object.keys(errors).length) return { ok: false, error: "validation", errors };

  const now = nowIso();
  const id = existing?.id ?? uid("p");
  const slug = existing?.slug ?? uniqueSlug(draft.nameFr || draft.nameHt, state.products.map((p) => p.slug));
  let record = draftToRecord(next, { id, slug, now, createdAt: existing?.createdAt, featuredRank: existing?.featuredRank, isNew: existing?.isNew ?? !existing, relatedIds: existing?.relatedIds, isSample: existing?.isSample });
  const movements: StockMovement[] = [];

  if (existing) {
    // Physical stock of existing items only changes through recorded movements (Inventory), never through the product form.
    record = { ...record, inventory: { ...record.inventory, onHand: existing.inventory.onHand }, variants: record.variants.map((v) => {
      const old = existing.variants.find((o) => o.id === v.id);
      if (old) return { ...v, onHand: old.onHand };
      if (v.onHand > 0) movements.push({ id: uid("mv"), productId: id, variantId: v.id, type: "initial", delta: v.onHand, balanceAfter: v.onHand, reason: "reception", at: now, by: staff });
      return v;
    }) };
    if (!existing.inventory.tracked && record.inventory.tracked && !hasVariantsRecord(record)) record = { ...record, inventory: { ...record.inventory, onHand: draft.onHand ? Math.max(0, Number(draft.onHand) || 0) : 0 } };
  } else if (record.inventory.tracked) {
    if (hasVariantsRecord(record)) for (const v of record.variants) { if (v.onHand > 0) movements.push({ id: uid("mv"), productId: id, variantId: v.id, type: "initial", delta: v.onHand, balanceAfter: v.onHand, reason: "reception", at: now, by: staff }); }
    else if (record.inventory.onHand > 0) movements.push({ id: uid("mv"), productId: id, type: "initial", delta: record.inventory.onHand, balanceAfter: record.inventory.onHand, reason: "reception", at: now, by: staff });
  }
  catalogStore.set((s) => ({ ...s, products: existing ? s.products.map((p) => (p.id === id ? record : p)) : [record, ...s.products], movements: [...s.movements, ...movements] }));
  return { ok: true, data: { id, slug } };
}

/** Activate or deactivate from the product list. Activating re-runs the publish rules. */
export async function setProductStatus(id: string, status: ProductStatus): Promise<CatalogResult<ProductRecord>> {
  await latency(200);
  const state = catalogStore.getSnapshot();
  const p = state.products.find((x) => x.id === id);
  if (!p) return { ok: false, error: "not_found" };
  if (status === "active") {
    const otherSkus = state.products.filter((x) => x.id !== id).flatMap((x) => [x.sku, ...x.variants.map((v) => v.sku)]).filter(Boolean);
    const errors = validateDraft({ ...recordToDraft(p), status }, state.categories.find((c) => c.slug === p.categorySlug), otherSkus, "publish");
    if (Object.keys(errors).length) return { ok: false, error: "validation", errors };
  }
  const updated = { ...p, status, updatedAt: nowIso() };
  catalogStore.set((s) => ({ ...s, products: s.products.map((x) => (x.id === id ? updated : x)) }));
  return { ok: true, data: updated };
}

export interface StockAdjustment { productId: string; variantId?: string; type: Exclude<StockMovementType, "initial" | "sale">; quantity: number; reason: StockReason; note?: string }

/** Add, reduce or recount physical stock. Reserved quantities are not touched. */
export async function adjustStock(adj: StockAdjustment, staff: string): Promise<CatalogResult<StockMovement>> {
  await latency(250);
  const state = catalogStore.getSnapshot();
  const p = state.products.find((x) => x.id === adj.productId);
  if (!p || !p.inventory.tracked) return { ok: false, error: "not_found" };
  const v = adj.variantId ? p.variants.find((x) => x.id === adj.variantId) : undefined;
  if (adj.variantId && !v) return { ok: false, error: "not_found" };
  if (!Number.isInteger(adj.quantity) || adj.quantity < (adj.type === "recount" ? 0 : 1)) return { ok: false, error: "stock_invalid" };
  const before = v ? v.onHand : p.inventory.onHand;
  const after = adj.type === "add" ? before + adj.quantity : adj.type === "reduce" ? before - adj.quantity : adj.quantity;
  if (after < 0) return { ok: false, error: "stock_negative" };
  const movement: StockMovement = { id: uid("mv"), productId: p.id, variantId: adj.variantId, type: adj.type, delta: after - before, balanceAfter: after, reason: adj.reason, note: adj.note?.trim() || undefined, at: nowIso(), by: staff };
  catalogStore.set((s) => ({
    ...s,
    products: s.products.map((x) => (x.id !== p.id ? x : v ? { ...x, variants: x.variants.map((y) => (y.id === v.id ? { ...y, onHand: after } : y)) } : { ...x, inventory: { ...x.inventory, onHand: after } })),
    movements: [...s.movements, movement],
  }));
  return { ok: true, data: movement };
}

export async function saveCategory(rec: CategoryRecord, isNew: boolean): Promise<CatalogResult<CategoryRecord>> {
  await latency();
  const state = catalogStore.getSnapshot();
  const others = state.categories.filter((c) => c.slug !== rec.slug).map((c) => c.slug);
  const errors = validateCategory(rec, others);
  if (Object.keys(errors).length) return { ok: false, error: "validation", errors };
  const slug = isNew ? uniqueSlug(rec.name.fr || rec.name.ht, state.categories.map((c) => c.slug)) : rec.slug;
  const saved: CategoryRecord = { ...rec, slug, order: isNew ? Math.max(0, ...state.categories.map((c) => c.order)) + 1 : rec.order, attributes: rec.attributes.map((a) => ({ ...a, key: a.key || slugify(a.label.fr || a.label.ht).replace(/-/g, "_") })) };
  catalogStore.set((s) => ({ ...s, categories: isNew ? [...s.categories, saved] : s.categories.map((c) => (c.slug === slug ? saved : c)) }));
  return { ok: true, data: saved };
}

/** Deactivating hides a category (and its products) from customers without deleting anything. */
export async function setCategoryActive(slug: string, active: boolean): Promise<CatalogResult<CategoryRecord>> {
  await latency(200);
  const c = catalogStore.getSnapshot().categories.find((x) => x.slug === slug);
  if (!c) return { ok: false, error: "not_found" };
  const updated = { ...c, active };
  catalogStore.set((s) => ({ ...s, categories: s.categories.map((x) => (x.slug === slug ? updated : x)) }));
  return { ok: true, data: updated };
}

export async function moveCategory(slug: string, direction: -1 | 1): Promise<void> {
  const list = [...catalogStore.getSnapshot().categories].sort((a, b) => a.order - b.order);
  const i = list.findIndex((c) => c.slug === slug);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  catalogStore.set((s) => ({ ...s, categories: list.map((c, n) => ({ ...c, order: n + 1 })) }));
}
