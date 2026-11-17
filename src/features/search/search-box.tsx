"use client";

import { Search, Tag } from "lucide-react";
import Image from "@/components/ui/smart-image";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { MoneyText } from "@/components/ui/price";
import { useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { useCategories } from "@/lib/api/catalog-hooks";
import { toProduct } from "@/lib/api/map-catalog";
import { searchProducts } from "@/lib/api/public";
import { useApiResource } from "@/lib/api/use-resource";
import { useLocale } from "@/i18n/provider";
import { cn } from "@/lib/cn";
import type { Money } from "@/lib/money";

interface Suggestion {
  type: "product" | "category";
  label: string;
  href: string;
  image?: { src: string; alt: string };
  price?: Money;
}

const SUGGEST_DELAY_MS = 300;
const SUGGEST_MIN_CHARS = 2;

type BoxProps = { autoFocus?: boolean; inline?: boolean; onNavigate?: () => void; className?: string };

/**
 * Search combobox (ARIA 1.2 list autocomplete). Product suggestions come from the API's full-text search (`GET /products/search`, size 5): the
 * request is sent only after the user pauses typing (300 ms) and at least 2 characters, and a superseded request is aborted. Category suggestions
 * filter the (small) category list already loaded for navigation. Enter with no highlighted option opens the full results page.
 * The input starts with the current URL's `q`, so the query survives navigating results.
 */
export function SearchBox(props: BoxProps) {
  return <Suspense fallback={<SearchBoxInner {...props} initialQuery="" />}><UrlAwareSearchBox {...props} /></Suspense>;
}

function UrlAwareSearchBox(props: BoxProps) {
  const q = useSearchParams().get("q") ?? "";
  return <SearchBoxInner key={q} {...props} initialQuery={q} />;
}

function SearchBoxInner({ autoFocus = false, inline = false, onNavigate, className, initialQuery }: BoxProps & { initialQuery: string }) {
  const router = useLocaleRouter();
  const t = useT();
  const locale = useLocale();
  const listId = useId();
  const { categories } = useCategories();
  const [query, setQuery] = useState(initialQuery);
  const [settled, setSettled] = useState(initialQuery.trim());
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const canSuggest = trimmed.length >= SUGGEST_MIN_CHARS;

  // Debounce: `settled` follows the typed text only after a pause.
  useEffect(() => {
    if (trimmed === settled) return;
    const id = window.setTimeout(() => setSettled(trimmed), SUGGEST_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [trimmed, settled]);

  const suggestKey = open && settled.length >= SUGGEST_MIN_CHARS ? `suggest:${settled}` : null;
  const suggestions = useApiResource(suggestKey, (signal) => searchProducts({ q: settled }, 5, { signal }));
  const waiting = canSuggest && (trimmed !== settled || (suggestKey !== null && suggestions.loading));
  const results = useMemo<Suggestion[]>(() => {
    if (!canSuggest) return [];
    const cats = categories.filter((c) => c.name.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 2).map<Suggestion>((c) => ({ type: "category", label: c.name, href: `/products?category=${c.slug}` }));
    const items = trimmed === settled ? (suggestions.data?.items ?? []) : [];
    const prods = items.map((dto) => toProduct(dto, locale)).filter((p) => p !== null).map<Suggestion>((p) => ({ type: "product", label: p.name, href: `/products/${p.slug}`, image: p.images[0], price: p.price }));
    return [...cats, ...prods];
  }, [canSuggest, trimmed, settled, suggestions.data, categories, locale]);

  useEffect(() => {
    const close = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const optionCount = results.length + (trimmed ? 1 : 0); // suggestions + the final "all results" row
  const showPanel = open && trimmed.length > 0;
  const searchHref = `/search?q=${encodeURIComponent(trimmed)}`;
  const go = (href: string) => { setOpen(false); onNavigate?.(); router.push(href); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => (optionCount ? (a + 1) % optionCount : -1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (optionCount ? (a <= 0 ? optionCount - 1 : a - 1) : -1)); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    go(active >= 0 && active < results.length ? results[active].href : searchHref);
  };
  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <form role="search" onSubmit={onSubmit} className="relative">
        <label htmlFor={`${listId}-input`} className="sr-only">{t("search.placeholder")}</label>
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-muted" />
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          enterKeyHint="search"
          placeholder={t("search.placeholder")}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(-1); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full rounded-full border border-line-strong bg-surface pl-10 pr-4 text-body text-ink placeholder:text-ink-muted [&::-webkit-search-cancel-button]:appearance-none"
        />
      </form>

      {showPanel && (
        <div className={cn("overflow-hidden bg-surface", inline ? "mt-3" : "absolute inset-x-0 top-full z-50 mt-2 rounded-card border border-line shadow-float")}>
          <ul id={listId} role="listbox" aria-label={t("search.suggestions")}>
            {results.map((s, i) => (
              <li key={`${s.type}-${s.href}`} id={optionId(i)} role="option" aria-selected={active === i} onMouseEnter={() => setActive(i)} onClick={() => go(s.href)} className={cn("flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2", active === i && "bg-sand-50")}>
                {s.type === "product" && s.image ? (
                  <Image src={s.image.src} alt="" width={40} height={40} className="size-10 shrink-0 rounded bg-sand-100 object-cover" />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded bg-sand-100 text-ink-soft"><Tag aria-hidden className="size-4" /></span>
                )}
                <span className="text-label min-w-0 flex-1 truncate">
                  {s.label}
                  {s.type === "category" && <span className="text-caption ml-2 font-normal text-ink-muted">{t("search.category")}</span>}
                </span>
                {s.price && <MoneyText value={s.price} className="text-caption text-ink-soft" />}
              </li>
            ))}
            <li id={optionId(results.length)} role="option" aria-selected={active === results.length} onMouseEnter={() => setActive(results.length)} onClick={() => go(searchHref)} className={cn("text-label flex min-h-12 cursor-pointer items-center gap-2 border-t border-line px-3 font-semibold text-brand-700", active === results.length && "bg-sand-50")}>
              <Search aria-hidden className="size-4" />
              {t("search.searchAll", { q: trimmed })}
            </li>
          </ul>
          <p role="status" className="sr-only">{canSuggest ? t("search.count", { count: results.length }) : ""}</p>
          {canSuggest && waiting && <p role="status" className="text-caption border-t border-line px-3 py-2 text-ink-soft">{t("search.loading")}</p>}
          {canSuggest && !waiting && suggestions.error != null && <p role="alert" className="text-caption border-t border-line px-3 py-2 text-danger-fg">{t("search.unavailable")}</p>}
          {canSuggest && !waiting && suggestions.error == null && results.length === 0 && <p className="text-caption border-t border-line px-3 py-2 text-ink-soft">{t("search.none")}</p>}
        </div>
      )}
    </div>
  );
}
