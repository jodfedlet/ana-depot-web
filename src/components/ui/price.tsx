"use client";

import type { UnitId } from "@/lib/catalog/model";
import { useLocale, useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";
import { discountPercent, formatMoney, type Money } from "@/lib/money";

/** "pièce" / "paires" for a selling unit, in the UI language. */
export function useUnitLabel() {
  const t = useT();
  return (unit: UnitId, count = 1) => t(`units.${unit}`, { count });
}

/** Formats an amount in the UI language's number format. Never converts currency. */
export function MoneyText({ value, className }: { value: Money; className?: string }) {
  const locale = useLocale();
  return <span className={cn("text-price", className)}>{formatMoney(value, locale)}</span>;
}

/**
 * Amounts per currency, one per line, never summed. Use wherever a reservation/cart can hold several currencies.
 * A single-currency list renders like one `MoneyText`.
 */
export function MoneyTotals({ totals, className, align = "end", inline = false }: { totals: readonly Money[]; className?: string; align?: "start" | "end"; /** Single line separated by " · " (for sentences). Never a sum. */ inline?: boolean }) {
  const locale = useLocale();
  if (totals.length === 0) return <span>—</span>;
  if (inline) return <span className={cn("text-price", className)}>{totals.map((m) => formatMoney(m, locale)).join(" · ")}</span>;
  return (
    <span className={cn("inline-flex flex-col", align === "end" ? "items-end" : "items-start", className)}>
      {totals.map((m) => <MoneyText key={m.currency} value={m} />)}
    </span>
  );
}

/** `<dl>` rows for per-currency amounts: the label gets the currency code only when there are several currencies. */
export function MoneyRows({ label, totals, className, valueClassName }: { label: string; totals: readonly Money[]; className?: string; valueClassName?: string }) {
  const locale = useLocale();
  return (
    <dl className={cn("flex flex-col gap-1.5", className)}>
      {totals.map((m) => (
        <div key={m.currency} className="flex items-baseline justify-between gap-4">
          <dt>{totals.length > 1 ? `${label} · ${m.currency}` : label}</dt>
          <dd className={cn("text-price", valueClassName)}>{formatMoney(m, locale)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Price({
  price,
  compareAt,
  size = "md",
  from = false,
  unit,
  className,
}: {
  price: Money;
  compareAt?: Money;
  size?: "sm" | "md" | "lg";
  /** Prefix "From" when variants have different prices. */
  from?: boolean;
  /** Selling unit shown after the price ("/ pair"). */
  unit?: UnitId;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const unitLabel = useUnitLabel();
  const pct = discountPercent(price, compareAt);
  const sizes = { sm: "text-[0.9375rem]", md: "text-[1.0625rem]", lg: "text-2xl" };
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      {from && <span className="text-caption text-ink-soft">{t("product.from")}</span>}
      <span className={cn("text-price text-ink", sizes[size])}>
        <span className="sr-only">{t("product.currentPrice")}</span>
        {formatMoney(price, locale)}
      </span>
      {unit && <span className="text-caption text-ink-soft">{t("units.per", { unit: unitLabel(unit) })}</span>}
      {pct > 0 && compareAt && (
        <>
          <span className="text-price text-caption text-ink-muted line-through">
            <span className="sr-only">{t("product.previousPrice")}</span>
            {formatMoney(compareAt, locale)}
          </span>
          <span className="text-caption font-semibold text-accent-700">
            <span className="sr-only">{t("product.discount", { pct })}</span>
            <span aria-hidden>{t("product.off", { pct })}</span>
          </span>
        </>
      )}
    </p>
  );
}
