"use client";

import { Search, Tag } from "lucide-react";
import Image from "@/components/ui/smart-image";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MoneyText } from "@/components/ui/price";
import { useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { useStorefront } from "@/lib/catalog/hooks";
import { queryCatalog } from "@/lib/catalog-query";
import { cn } from "@/lib/cn";
import type { Money } from "@/lib/money";

interface Suggestion {
  type: "product" | "category";
  label: string;
  href: string;
  image?: { src: string; alt: string };
  price?: Money;
}

/**
 * Search combobox (ARIA 1.2 list autocomplete). Suggestions are computed from the demo catalog store, so products
 * the seller adds are searchable at once; this becomes a search-endpoint call when the backend exists.
 * Enter with no highlighted option goes to the full results page.
 */
export function SearchBox({ autoFocus = false, inline = false, onNavigate, className }: { autoFocus?: boolean; inline?: boolean; onNavigate?: () => void; className?: string }) {
  const router = useLocaleRouter();
  const t = useT();
  const listId = useId();
  const { products, categories } = useStorefront();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const canSuggest = trimmed.length >= 2;
  const results = useMemo<Suggestion[]>(() => {
    if (!canSuggest) return [];
    const names = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
    const cats = categories.filter((c) => c.name.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 2).map<Suggestion>((c) => ({ type: "category", label: c.name, href: `/products?category=${c.slug}` }));
    const prods = queryCatalog(products, { q: trimmed, pageSize: 5 }, names).products.map<Suggestion>((p) => ({ type: "product", label: p.name, href: `/products/${p.slug}`, image: p.images[0], price: p.price }));
    return [...cats, ...prods];
  }, [canSuggest, trimmed, products, categories]);

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
          {canSuggest && results.length === 0 && <p className="text-caption border-t border-line px-3 py-2 text-ink-soft">{t("search.none")}</p>}
        </div>
      )}
    </div>
  );
}
