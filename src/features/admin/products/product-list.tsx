"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import Image from "@/components/ui/smart-image";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/link";
import { useLText, useLocale, useT } from "@/i18n/provider";
import { setProductStatus } from "@/lib/api/catalog-admin";
import { type ProductRecord, type ProductStatus, hasVariantsRecord } from "@/lib/catalog/model";
import { stockOf, stockState } from "@/lib/catalog/stock";
import { formatMoney } from "@/lib/money";
import { useCatalogState } from "@/lib/stores/catalog-store";
import { useIsClient } from "@/lib/stores/create-persisted-store";
import { useReservations } from "@/lib/stores/reservation-store";

const field = "text-label min-h-11 rounded-control border border-line-strong bg-surface px-3";
const PAGE = 10;
const statusTone: Record<ProductStatus, "neutral" | "success" | "warning"> = { draft: "warning", active: "success", inactive: "neutral" };

/** Retail price, or the range across variants that carry their own price. */
function priceText(p: ProductRecord, locale: string): string {
  const prices = hasVariantsRecord(p) ? p.variants.filter((v) => v.active).map((v) => v.price ?? p.pricing.retail) : [p.pricing.retail];
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const f = (n: number) => formatMoney({ amount: n, currency: p.pricing.currency }, locale);
  return !p.pricing.retail && !prices.some(Boolean) ? "—" : lo === hi ? f(lo) : `${f(lo)} – ${f(hi)}`;
}

export function ProductList() {
  const t = useT();
  const lt = useLText();
  const locale = useLocale();
  const toast = useToast();
  const ready = useIsClient();
  const { products, categories } = useCatalogState();
  const reservations = useReservations();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [stock, setStock] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .map((p) => { const info = stockOf(p, reservations); return { p, info, state: stockState(p, info) }; })
      .filter(({ p, state }) =>
        (!category || p.categorySlug === category) && (!status || p.status === status) &&
        (!stock || (stock === "low" ? state === "low" : stock === "out" ? state === "out" : state === "ok")) &&
        (!needle || [p.name.fr, p.name.ht, p.sku, ...p.variants.map((v) => v.sku)].join(" ").toLowerCase().includes(needle)))
      .sort((a, b) => b.p.updatedAt.localeCompare(a.p.updatedAt));
  }, [products, reservations, q, category, status, stock]);

  if (!ready) return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-11 w-full" /><Skeleton className="mt-4 h-72 w-full" /></div>;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pageCount);
  const shown = rows.slice((current - 1) * PAGE, current * PAGE);
  const hasFilters = !!(q || category || status || stock);
  const catName = (slug: string) => { const c = categories.find((x) => x.slug === slug); return c ? lt(c.name) : "—"; };

  const toggle = async (p: ProductRecord) => {
    const next: ProductStatus = p.status === "active" ? "inactive" : "active";
    setBusy(p.id);
    const r = await setProductStatus(p.id, next);
    setBusy(null);
    if (!r.ok) toast.show({ tone: "error", message: t("admin.products.toasts.activateFailed"), action: { label: t("admin.products.edit"), href: `/admin/products/${p.id}` } });
    else toast.show({ tone: "success", message: next === "active" ? t("admin.products.toasts.activated") : t("admin.products.toasts.deactivated") });
  };

  const stockCell = (r: (typeof rows)[number]) =>
    r.state === "untracked" ? <Badge>{t("admin.inventory.states.untracked")}</Badge> : (
      <div>
        <Badge tone={r.state === "ok" ? "success" : r.state === "low" ? "warning" : "danger"}>{t(`admin.inventory.states.${r.state}`)}</Badge>
        <p className="text-caption mt-1 text-ink-soft">{t("admin.products.stockLine", { available: r.info.available, reserved: r.info.reserved })}</p>
      </div>
    );
  const nameCell = (p: ProductRecord) => (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative size-12 shrink-0 overflow-hidden rounded-control bg-sand-100">
        <Image src={p.images[0]?.src ?? "/sample/placeholder.svg"} alt="" fill sizes="48px" className="object-cover" />
      </div>
      <div className="min-w-0">
        <p className="text-label truncate font-semibold">{lt(p.name) || t("admin.products.untitled")}</p>
        <p className="text-caption text-ink-muted">{p.sku || t("admin.products.noSku")}{hasVariantsRecord(p) ? ` · ${t("admin.products.variantsCount", { count: p.variants.length })}` : ""}</p>
        {(!p.name.fr.trim() || !p.name.ht.trim()) && <p className="text-caption font-medium text-warning-fg">{t("admin.products.translationMissing", { lang: !p.name.ht.trim() ? "KR" : "FR" })}</p>}
      </div>
    </div>
  );
  const wholesaleCell = (p: ProductRecord) => p.pricing.wholesale.enabled && p.pricing.wholesale.tiers.length ? <Badge tone="accent">{t("admin.products.wholesaleFrom", { qty: Math.min(...p.pricing.wholesale.tiers.map((x) => x.minQty)) })}</Badge> : <span className="text-ink-muted">—</span>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-label font-normal text-ink-soft">{t("admin.products.count", { count: rows.length })}</p>
        <ButtonLink href="/admin/products/new"><Plus aria-hidden className="size-4" />{t("admin.products.new")}</ButtonLink>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="pq" className="sr-only">{t("admin.products.search")}</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input id="pq" type="search" placeholder={t("admin.products.search")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className={`${field} w-full pl-9`} />
        </div>
        <div><label htmlFor="pc" className="text-caption mb-1 block text-ink-muted">{t("admin.products.category")}</label>
          <select id="pc" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={`${field} w-full`}><option value="">{t("admin.products.allCategories")}</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{lt(c.name)}</option>)}</select></div>
        <div><label htmlFor="ps" className="text-caption mb-1 block text-ink-muted">{t("admin.products.status")}</label>
          <select id="ps" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={`${field} w-full`}><option value="">{t("admin.products.allStatuses")}</option>{(["draft", "active", "inactive"] as const).map((s) => <option key={s} value={s}>{t(`admin.products.statuses.${s}`)}</option>)}</select></div>
        <div><label htmlFor="pk" className="text-caption mb-1 block text-ink-muted">{t("admin.products.stock")}</label>
          <select id="pk" value={stock} onChange={(e) => { setStock(e.target.value); setPage(1); }} className={`${field} w-full`}><option value="">{t("admin.products.allStock")}</option><option value="ok">{t("admin.inventory.states.ok")}</option><option value="low">{t("admin.inventory.states.low")}</option><option value="out">{t("admin.inventory.states.out")}</option></select></div>
      </form>

      {shown.length === 0 ? (
        <div className="rounded-card border border-line bg-surface"><EmptyState icon={<Search aria-hidden />} title={products.length === 0 ? t("admin.products.emptyTitle") : t("admin.products.noMatchTitle")} description={products.length === 0 ? t("admin.products.emptyText") : t("admin.products.noMatchText")}>
          {hasFilters ? <Button onClick={() => { setQ(""); setCategory(""); setStatus(""); setStock(""); }}>{t("admin.list.resetFilters")}</Button> : <ButtonLink href="/admin/products/new">{t("admin.products.new")}</ButtonLink>}
        </EmptyState></div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
            <table className="w-full min-w-[56rem] text-left">
              <caption className="sr-only">{t("admin.nav.products")}</caption>
              <thead className="text-caption border-b border-line bg-sand-50 text-ink-muted">
                <tr>{(["product", "category", "status", "price", "wholesale", "stock", "actions"] as const).map((c) => <th key={c} scope="col" className="px-3 py-3 font-medium">{t(`admin.products.columns.${c}`)}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.p.id} className="text-label align-middle font-normal hover:bg-sand-50">
                    <th scope="row" className="max-w-xs px-3 py-3 font-normal">{nameCell(r.p)}</th>
                    <td className="px-3 py-3 text-ink-soft">{catName(r.p.categorySlug)}</td>
                    <td className="px-3 py-3"><Badge tone={statusTone[r.p.status]}>{t(`admin.products.statuses.${r.p.status}`)}</Badge></td>
                    <td className="whitespace-nowrap px-3 py-3">{priceText(r.p, locale)}<p className="text-caption text-ink-muted">{t(`units.${r.p.unit}`, { count: 1 })}</p></td>
                    <td className="px-3 py-3">{wholesaleCell(r.p)}</td>
                    <td className="px-3 py-3">{stockCell(r)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/products/${r.p.id}`} className="text-label inline-flex min-h-9 items-center font-semibold text-brand-700 hover:underline">{t("admin.products.edit")}</Link>
                        <Button size="sm" variant="outline" loading={busy === r.p.id} onClick={() => toggle(r.p)}>{r.p.status === "active" ? t("admin.products.deactivate") : r.p.status === "draft" ? t("admin.products.publish") : t("admin.products.activate")}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {shown.map((r) => (
              <li key={r.p.id} className="rounded-card border border-line bg-surface p-4">
                {nameCell(r.p)}
                <dl className="text-caption mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-ink-soft">
                  <div><dt>{t("admin.products.columns.status")}</dt><dd><Badge tone={statusTone[r.p.status]}>{t(`admin.products.statuses.${r.p.status}`)}</Badge></dd></div>
                  <div><dt>{t("admin.products.columns.price")}</dt><dd className="text-ink">{priceText(r.p, locale)}</dd></div>
                  <div><dt>{t("admin.products.columns.wholesale")}</dt><dd>{wholesaleCell(r.p)}</dd></div>
                  <div><dt>{t("admin.products.columns.stock")}</dt><dd>{stockCell(r)}</dd></div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <ButtonLink href={`/admin/products/${r.p.id}`} variant="outline" className="flex-1">{t("admin.products.edit")}</ButtonLink>
                  <Button variant="outline" className="flex-1" loading={busy === r.p.id} onClick={() => toggle(r.p)}>{r.p.status === "active" ? t("admin.products.deactivate") : r.p.status === "draft" ? t("admin.products.publish") : t("admin.products.activate")}</Button>
                </div>
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <nav aria-label={t("admin.list.pagination")} className="flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>{t("admin.list.previous")}</Button>
              <span className="text-label font-normal text-ink-soft">{t("admin.list.pageOf", { page: current, count: pageCount })}</span>
              <Button variant="outline" size="sm" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>{t("admin.list.next")}</Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
