"use client";

import { Plus, Search } from "lucide-react";
import { AdminErrorState } from "@/components/ui/admin-error";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import Image from "@/components/ui/smart-image";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLText, useT } from "@/i18n/provider";
import type { AdminProductSummary } from "@/lib/api/admin/dto";
import { listAllCategories, listProducts } from "@/lib/api/admin/endpoints";
import { useAdminResource } from "@/lib/api/admin/hooks";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { PLACEHOLDER_IMAGE, safeImageUrl } from "@/lib/api/map-catalog";
import { useMoneyText, useUrlState } from "../common";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";
const STATUSES = ["DRAFT", "ACTIVE", "INACTIVE"] as const;
const STOCK = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "NO_STOCK_RECORD"] as const;
const SORTS = ["NEWEST", "UPDATED", "NAME", "SKU"] as const;
const PAGE = 20;

/** The product list: search, filters, sorting and paging are all done by the API (`GET /admin/products`); nothing is filtered in the browser. */
export function ProductList() {
  const t = useT();
  const lt = useLText();
  const fmt = useFormat();
  const money = useMoneyText();
  const url = useUrlState("/admin/products");
  const q = url.get("q"), status = url.get("status"), categoryId = url.get("category"), currency = url.get("currency"), stock = url.get("stock"), sort = url.get("sort");
  const page = Math.max(0, Number(url.get("page")) || 0);

  const cats = useAdminResource("categories:all", (signal) => listAllCategories(signal));
  const res = useAdminResource(`products:${q}:${status}:${categoryId}:${currency}:${stock}:${sort}:${page}`, (signal) =>
    listProducts({ q: q || undefined, status: status || undefined, categoryId: categoryId || undefined, currency: currency || undefined, stock: stock || undefined, sort: sort || undefined, page, size: PAGE }, { signal }));
  const catName = (id: string) => { const c = cats.data?.find((x) => x.id === id); return c ? lt({ fr: c.name.fr ?? "", ht: c.name.ht ?? "" }) || c.slug : "—"; };
  const name = (p: AdminProductSummary) => lt({ fr: p.name.fr ?? "", ht: p.name.ht ?? "" }) || t("admin.products.untitled");
  const missing = (p: AdminProductSummary) => (!p.name.fr?.trim() ? "FR" : !p.name.ht?.trim() ? "HT" : null);
  const hasFilters = !!(q || status || categoryId || currency || stock);

  const priceLines = (p: AdminProductSummary) => p.prices.filter((x) => x.active).map((x) => (
    <p key={x.currency} className="text-caption">
      <span className="font-semibold text-ink">{money(x.sale ?? x.retail, x.currency)}</span>
      {x.sale && <span className="ml-1 text-ink-muted line-through">{money(x.retail, x.currency)}</span>}
      {x.wholesaleEnabled && x.tiers.length > 0 && <span className="ml-1 text-accent-700">· {t("admin.products.wholesaleFrom", { qty: x.tiers[0].minQuantity })}</span>}
    </p>
  ));
  const stockCell = (p: AdminProductSummary) => p.stock.positions.length === 0
    ? <Badge tone="warning">{t("adminProd.noStockRecord")}</Badge>
    : p.stock.hasUntrackedPosition && p.stock.positions.every((x) => !x.tracked) ? <Badge>{t("adminProd.untracked")}</Badge>
      : <div><Badge tone={p.stock.state === "OK" ? "success" : p.stock.state === "LOW" ? "warning" : "danger"}>{t(`adminProd.stockStates.${(p.stock.state === "OK" ? "IN_STOCK" : p.stock.state === "LOW" ? "LOW_STOCK" : "OUT_OF_STOCK") as "IN_STOCK"}`)}</Badge><p className="text-caption mt-1 text-ink-soft">{t("admin.products.stockLine", { available: p.stock.available, reserved: p.stock.reserved })}</p></div>;
  const image = (p: AdminProductSummary) => <div className="relative size-12 shrink-0 overflow-hidden rounded-control bg-sand-100"><Image src={safeImageUrl(p.primaryImageUrl) ?? PLACEHOLDER_IMAGE} alt="" fill sizes="48px" className="object-cover" /></div>;
  const statusBadge = (p: AdminProductSummary) => <Badge tone={p.status === "ACTIVE" ? "success" : p.status === "DRAFT" ? "warning" : "neutral"}>{t(`admin.products.statuses.${p.status.toLowerCase() as "draft"}`)}</Badge>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="relative min-w-0 flex-1 basis-64">
          <label htmlFor="pq" className="sr-only">{t("admin.products.search")}</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="pq" type="search" defaultValue={q} key={q} placeholder={t("admin.products.search")} onChange={(e) => { const v = e.target.value; window.clearTimeout((window as unknown as { __pq?: number }).__pq); (window as unknown as { __pq?: number }).__pq = window.setTimeout(() => url.set({ q: v || undefined }), 350); }} className={`${field} w-full pl-9`} />
        </form>
        <ButtonLink href="/admin/products/new"><Plus aria-hidden className="size-4" />{t("admin.products.new")}</ButtonLink>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select id="pc" label={t("admin.products.category")} value={categoryId} onChange={(v) => url.set({ category: v || undefined })} all={t("admin.products.allCategories")} options={(cats.data ?? []).map((c) => [c.id, lt({ fr: c.name.fr ?? "", ht: c.name.ht ?? "" }) || c.slug])} />
        <Select id="ps" label={t("admin.products.status")} value={status} onChange={(v) => url.set({ status: v || undefined })} all={t("admin.products.allStatuses")} options={STATUSES.map((s) => [s, t(`admin.products.statuses.${s.toLowerCase() as "draft"}`)])} />
        <Select id="pcur" label={t("adminProd.currency")} value={currency} onChange={(v) => url.set({ currency: v || undefined })} all={t("adminDash.allCurrencies")} options={SUPPORTED_CURRENCIES.map((c) => [c, c])} />
        <Select id="pst" label={t("admin.products.stock")} value={stock} onChange={(v) => url.set({ stock: v || undefined })} all={t("admin.products.allStock")} options={STOCK.map((s) => [s, t(`adminProd.stockStates.${s}`)])} />
        <Select id="pso" label={t("admin.list.sort")} value={sort} onChange={(v) => url.set({ sort: v || undefined })} all={t("adminProd.sort.RELEVANCE")} options={SORTS.map((s) => [s, t(`adminProd.sort.${s}`)])} />
      </div>

      {res.error != null && !res.data ? <AdminErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <div role="status" aria-label={t("adminCommon.loading")}><Skeleton className="h-72 w-full" /></div> : (
        <>
          <p role="status" className="text-label font-normal text-ink-soft">{t("admin.products.count", { count: res.data.totalItems })}{hasFilters && <Button variant="ghost" size="sm" className="ml-2" onClick={url.clear}>{t("adminCommon.clearFilters")}</Button>}</p>
          {res.data.items.length === 0 ? (
            <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Search aria-hidden />} title={hasFilters ? t("admin.products.noMatchTitle") : t("admin.products.emptyTitle")} description={hasFilters ? t("admin.products.noMatchText") : t("admin.products.emptyText")}>{!hasFilters && <ButtonLink href="/admin/products/new">{t("admin.products.new")}</ButtonLink>}</EmptyState></div>
          ) : (
            <div aria-busy={res.loading}>
              <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
                <table className="w-full min-w-[56rem] text-left">
                  <caption className="sr-only">{t("admin.products.title")}</caption>
                  <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted"><tr>{(["product", "category", "status", "price", "stock", "actions"] as const).map((c) => <th key={c} scope="col" className={`px-3 py-3 font-medium ${c === "actions" ? "text-right" : ""}`}>{t(`admin.products.columns.${c}`)}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {res.data.items.map((p) => (
                      <tr key={p.id} className="text-label align-top font-normal hover:bg-sand-50">
                        <th scope="row" className="px-3 py-3 text-left font-normal"><div className="flex items-center gap-3">{image(p)}<div className="min-w-0"><Link href={`/admin/products/${p.id}`} className="font-semibold hover:underline">{name(p)}</Link><p className="text-caption text-ink-soft">{p.sku || t("admin.products.noSku")}{p.variantCount > 0 && ` · ${t("admin.products.variantsCount", { count: p.variantCount })}`}</p>{missing(p) && <Badge tone="warning" className="mt-1">{t("admin.products.translationMissing", { lang: missing(p) ?? "" })}</Badge>}</div></div></th>
                        <td className="px-3 py-3">{catName(p.categoryId)}</td>
                        <td className="px-3 py-3">{statusBadge(p)}</td>
                        <td className="px-3 py-3">{priceLines(p)}</td>
                        <td className="px-3 py-3">{stockCell(p)}</td>
                        <td className="px-3 py-3 text-right"><ButtonLink href={`/admin/products/${p.id}`} variant="outline" size="sm">{t("admin.products.edit")}</ButtonLink></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-3 md:hidden">
                {res.data.items.map((p) => (
                  <li key={p.id} className="rounded-card border border-line bg-surface p-4">
                    <div className="flex items-start gap-3">{image(p)}<div className="min-w-0 flex-1"><p className="text-label font-semibold">{name(p)}</p><p className="text-caption text-ink-soft">{p.sku || t("admin.products.noSku")} · {catName(p.categoryId)}</p></div>{statusBadge(p)}</div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-ink-soft"><div>{priceLines(p)}</div><div>{stockCell(p)}</div></div>
                    <ButtonLink href={`/admin/products/${p.id}`} variant="outline" full className="mt-3">{t("admin.products.edit")}</ButtonLink>
                  </li>
                ))}
              </ul>
              {res.data.totalPages > 1 && (
                <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t("admin.list.pagination")}>
                  <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => url.set({ page: String(page - 1) }, true)}>{t("adminCommon.previous")}</Button>
                  <span className="text-label font-normal text-ink-soft">{t("adminCommon.page", { page: page + 1, count: res.data.totalPages })}</span>
                  <Button variant="outline" size="sm" disabled={page + 1 >= res.data.totalPages} onClick={() => url.set({ page: String(page + 1) }, true)}>{t("adminCommon.next")}</Button>
                </nav>
              )}
              <p className="text-caption mt-2 text-ink-muted">{t("adminCommon.updatedAt", { time: fmt.dateTime(res.data.items[0]?.updatedAt ?? new Date().toISOString()) })}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Select({ id, label, value, onChange, all, options }: { id: string; label: string; value: string; onChange: (v: string) => void; all: string; options: [string, string][] }) {
  return (
    <div><label htmlFor={id} className="text-caption mb-1 block text-ink-muted">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} w-full`}><option value="">{all}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );
}
