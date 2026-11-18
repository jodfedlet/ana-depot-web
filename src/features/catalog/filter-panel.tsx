"use client";

import { Loader2, SlidersHorizontal, X } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/field";
import { Link } from "@/i18n/link";
import { useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { activeFilterCount, catalogHref } from "@/lib/catalog-query";
import { type CatalogQuery, type Category, type FacetGroup, type SortKey, sortKeys } from "@/lib/catalog-types";
import { cn } from "@/lib/cn";

export interface CatalogFilterData {
  basePath: string;
  query: CatalogQuery;
  categories: Category[];
  facets: FacetGroup[];
  /** Always empty today: the API has no brand list endpoint, so no brand filter is offered (see docs). */
  brands: { value: string; count: number }[];
  /** Set when a currency is selected: price ranges only exist inside one currency. Bounds are unknown (the API does not return them). */
  priceBounds: { currency: string } | null;
  currencies: { code: string; count?: number }[];
  /** A price sort was requested but no currency is selected, so the API cannot order by price. */
  priceSortNeedsCurrency: boolean;
  total: number;
  /** Minor-unit digits of the catalog currency. */
  digits: number;
  /** Major-unit display values for the min/max inputs. */
  priceMajor: { min?: number; max?: number; boundsMin?: number; boundsMax?: number };
}

/** The URL is the source of truth; controls update optimistically while the server renders results. */
function useCatalogNav(data: CatalogFilterData) {
  const router = useLocaleRouter();
  const [pending, startTransition] = useTransition();
  const [query, setOptimisticQuery] = useOptimistic(data.query);
  const go = (patch: Partial<CatalogQuery>) =>
    startTransition(() => {
      setOptimisticQuery({ ...data.query, ...patch });
      router.replace(catalogHref(data.basePath, data.query, patch, data.digits), { scroll: false });
    });
  return { go, pending, data: { ...data, query } };
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-line py-5 first:pt-0 last:border-b-0">
      <legend className="text-h3 mb-3">{legend}</legend>
      <div className="space-y-2.5">{children}</div>
    </fieldset>
  );
}

function toggle(list: string[] | undefined, value: string): string[] {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

function FilterFields({ data, go }: { data: CatalogFilterData; go: (p: Partial<CatalogQuery>) => void }) {
  const t = useT();
  const { query, categories, facets, brands, priceMajor } = data;
  const [min, setMin] = useState(priceMajor.min?.toString() ?? "");
  const [max, setMax] = useState(priceMajor.max?.toString() ?? "");
  const [priceError, setPriceError] = useState<string>();
  const toMinor = (v: string) => (v.trim() === "" ? undefined : Math.round(Number(v) * 10 ** data.digits));

  const applyPrice = (e: React.FormEvent) => {
    e.preventDefault();
    const lo = toMinor(min);
    const hi = toMinor(max);
    if ((lo !== undefined && !Number.isFinite(lo)) || (hi !== undefined && !Number.isFinite(hi)) || (lo ?? 0) < 0) {
      setPriceError(t("catalog.priceInvalid"));
      return;
    }
    if (lo !== undefined && hi !== undefined && lo > hi) {
      setPriceError(t("catalog.priceOrder"));
      return;
    }
    setPriceError(undefined);
    go({ minPrice: lo, maxPrice: hi });
  };

  const numberInput = "min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-body tabular-nums placeholder:text-ink-muted";
  const catLink = (active: boolean) => cn("text-label flex min-h-10 items-center rounded-control px-2 hover:bg-sand-100", active && "bg-sand-100 font-semibold");

  return (
    <div>
      <Group legend={t("catalog.category")}>
        <ul className="space-y-0.5">
          <li>
            <Link href={catalogHref(data.basePath, query, { category: undefined }, data.digits)} aria-current={!query.category ? "true" : undefined} className={catLink(!query.category)}>
              {t("catalog.allCategories")}
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={catalogHref(data.basePath, query, { category: c.slug }, data.digits)} aria-current={query.category === c.slug ? "true" : undefined} className={catLink(query.category === c.slug)}>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </Group>

      <Group legend={t("catalog.availability")}>
        <Checkbox label={t("catalog.inStockOnly")} checked={!!query.inStockOnly} onChange={(e) => go({ inStockOnly: e.target.checked })} />
        <Checkbox label={t("catalog.wholesaleOnly")} checked={!!query.wholesaleOnly} onChange={(e) => go({ wholesaleOnly: e.target.checked })} />
      </Group>

      {data.currencies.length > 1 && (
        <Group legend={t("catalog.currency")}>
          <ul className="space-y-0.5">
            <li><Link href={catalogHref(data.basePath, query, { currency: undefined, minPrice: undefined, maxPrice: undefined }, data.digits)} aria-current={!query.currency ? "true" : undefined} className={catLink(!query.currency)}>{t("catalog.allCurrencies")}</Link></li>
            {data.currencies.map((c) => (
              <li key={c.code}>
                <Link href={catalogHref(data.basePath, query, { currency: c.code, minPrice: undefined, maxPrice: undefined }, data.digits)} aria-current={query.currency === c.code ? "true" : undefined} className={catLink(query.currency === c.code)}>
                  {c.code}{c.count !== undefined && <span className="ml-1.5 font-normal text-ink-muted">({c.count})</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {!data.priceBounds && data.currencies.length > 1 && (
        <Group legend={t("catalog.price")}><p className="text-caption text-ink-soft">{t("catalog.priceNeedsCurrency")}</p></Group>
      )}

      {data.priceBounds && (
        <Group legend={t("catalog.price")}>
          <form onSubmit={applyPrice} noValidate className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label htmlFor="price-min" className="sr-only">{t("catalog.minLabel", { currency: data.priceBounds.currency })}</label>
                <input id="price-min" inputMode="decimal" placeholder={t("catalog.minPlaceholder", { value: data.priceBounds.currency })} value={min} onChange={(e) => setMin(e.target.value)} className={numberInput} aria-invalid={priceError ? true : undefined} />
              </div>
              <span aria-hidden className="text-ink-muted">–</span>
              <div className="flex-1">
                <label htmlFor="price-max" className="sr-only">{t("catalog.maxLabel", { currency: data.priceBounds.currency })}</label>
                <input id="price-max" inputMode="decimal" placeholder={t("catalog.maxPlaceholder", { value: data.priceBounds.currency })} value={max} onChange={(e) => setMax(e.target.value)} className={numberInput} aria-invalid={priceError ? true : undefined} />
              </div>
            </div>
            <p className="text-caption text-ink-muted">{t("catalog.amountsIn", { currency: data.priceBounds.currency })}</p>
            {priceError && <p role="alert" className="text-caption font-medium text-danger-fg">{priceError}</p>}
            <Button type="submit" variant="outline" size="sm" full>{t("catalog.apply")}</Button>
          </form>
        </Group>
      )}

      {brands.length > 1 && (
        <Group legend={t("catalog.brand")}>
          {brands.map((b) => (
            <Checkbox key={b.value} label={<>{b.value} <span className="font-normal text-ink-muted">({b.count})</span></>} checked={query.brands?.includes(b.value) ?? false} onChange={() => go({ brands: toggle(query.brands, b.value) })} />
          ))}
        </Group>
      )}

      {facets.map((f) => (
        <Group key={f.key} legend={f.name}>
          {f.values.map((v) => (
            <Checkbox
              key={v.id}
              label={v.count === undefined ? v.label : <>{v.label} <span className="font-normal text-ink-muted">({v.count})</span></>}
              checked={query.attributes?.[f.key]?.includes(v.id) ?? false}
              onChange={() => go({ attributes: { ...query.attributes, [f.key]: toggle(query.attributes?.[f.key], v.id) } })}
            />
          ))}
        </Group>
      ))}
    </div>
  );
}

/** Desktop sidebar. Hidden below lg, where the toolbar's Filters button opens a drawer. */
export function FilterSidebar({ data }: { data: CatalogFilterData }) {
  const t = useT();
  const { go, data: live } = useCatalogNav(data);
  return (
    <aside aria-label={t("catalog.filters")} className="hidden lg:block">
      <FilterFields key={JSON.stringify([data.query.minPrice, data.query.maxPrice])} data={live} go={go} />
    </aside>
  );
}

/** Sort + mobile filters button + active filter chips. */
export function CatalogToolbar({ data: serverData }: { data: CatalogFilterData }) {
  const t = useT();
  const { go, pending, data } = useCatalogNav(serverData);
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(data.query);
  const { query } = data;

  const chips: { label: string; remove: () => void }[] = [];
  if (query.currency) chips.push({ label: query.currency, remove: () => go({ currency: undefined, minPrice: undefined, maxPrice: undefined }) });
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const lo = data.priceMajor.min, hi = data.priceMajor.max;
    chips.push({
      label: (data.priceBounds ? `${data.priceBounds.currency} ` : "") + (lo !== undefined && hi !== undefined ? t("catalog.priceRange", { min: lo, max: hi }) : lo !== undefined ? t("catalog.priceFrom", { min: lo }) : t("catalog.priceUpTo", { max: hi ?? "" })),
      remove: () => go({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  if (query.inStockOnly) chips.push({ label: t("catalog.inStock"), remove: () => go({ inStockOnly: false }) });
  if (query.wholesaleOnly) chips.push({ label: t("catalog.wholesale"), remove: () => go({ wholesaleOnly: false }) });
  query.brands?.forEach((b) => chips.push({ label: b, remove: () => go({ brands: toggle(query.brands, b) }) }));
  for (const [key, ids] of Object.entries(query.attributes ?? {})) {
    const group = data.facets.find((f) => f.key === key);
    ids.forEach((id) => chips.push({ label: `${group?.name ?? key}: ${group?.values.find((v) => v.id === id)?.label ?? id}`, remove: () => go({ attributes: { ...query.attributes, [key]: toggle(ids, id) } }) }));
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Button variant="outline" className="lg:hidden" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal aria-hidden className="size-4" />
          {t("catalog.filters")}{count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-brand-700 px-1 text-xs text-white">{count}</span>}
        </Button>
        <p className="text-label hidden font-normal text-ink-soft sm:block" role="status">
          {pending ? <span className="inline-flex items-center gap-1.5"><Loader2 aria-hidden className="size-4 animate-spin" /> {t("catalog.updating")}</span> : t("catalog.count", { count: data.total })}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="sort" className="text-label hidden text-ink-soft sm:block">{t("catalog.sortBy")}</label>
          <select id="sort" aria-label={t("catalog.sortBy")} value={query.sort ?? (query.q ? "relevance" : "newest")} onChange={(e) => go({ sort: e.target.value as SortKey })} className="text-label min-h-11 rounded-control border border-line-strong bg-surface px-3">
            {sortKeys.filter((k) => k !== "relevance" || query.q).map((k) => <option key={k} value={k}>{t(`catalog.sort.${k}`)}</option>)}
          </select>
        </div>
      </div>

      {data.priceSortNeedsCurrency && <p className="text-caption mt-3 text-ink-soft">{t("catalog.priceSortNeedsCurrency")}</p>}

      {chips.length > 0 && (
        <ul aria-label={t("catalog.activeFilters")} className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <li key={c.label}>
              <button type="button" onClick={c.remove} className="text-caption inline-flex min-h-8 items-center gap-1.5 rounded-full bg-sand-100 pl-3 pr-2 font-medium hover:bg-sand-200">
                {c.label}
                <X aria-hidden className="size-3.5" />
                <span className="sr-only">{t("catalog.removeFilter")}</span>
              </button>
            </li>
          ))}
          <li>
            <Link href={catalogHref(data.basePath, query, { minPrice: undefined, maxPrice: undefined, inStockOnly: false, wholesaleOnly: false, brands: [], attributes: {} }, data.digits)} className="text-caption inline-flex min-h-8 items-center px-2 font-semibold text-brand-700 underline underline-offset-2">
              {t("catalog.clearAll")}
            </Link>
          </li>
        </ul>
      )}

      <Drawer open={open} onClose={() => setOpen(false)} title={t("catalog.filters")} side="bottom" footer={<Button full onClick={() => setOpen(false)}>{t("catalog.showProducts", { count: data.total })}</Button>}>
        <FilterFields key={JSON.stringify([query.minPrice, query.maxPrice])} data={data} go={go} />
      </Drawer>
    </div>
  );
}
