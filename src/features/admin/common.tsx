"use client";

import { RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useLocaleRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/provider";
import { decimalToMinor } from "@/lib/api/decimal";
import { SUPPORTED_CURRENCIES, formatMoney } from "@/lib/money";

/** A decimal string from the API with its currency, shown with the ISO code. Unreadable amounts show a dash, never a guess. */
export function useMoneyText() {
  const locale = useLocale();
  return (value: string | null | undefined, currency: string) => {
    const minor = decimalToMinor(value, currency);
    return minor === null ? "—" : formatMoney({ amount: minor, currency }, locale);
  };
}

/** One value per supported currency (HTG, USD) from a per-currency map. They are listed side by side and NEVER summed or converted. */
export function CurrencyFigures({ values, className }: { values: Record<string, string> | undefined; className?: string }) {
  const money = useMoneyText();
  return (
    <dl className={className ?? "space-y-0.5"}>
      {SUPPORTED_CURRENCIES.map((c) => (
        <div key={c} className="flex items-baseline justify-between gap-4">
          <dt className="text-caption text-ink-muted">{c}</dt>
          <dd className="text-price tabular-nums">{values && values[c] !== undefined ? money(values[c], c) : "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Reads/writes a few URL search parameters so filters survive a refresh and can be bookmarked. */
export function useUrlState(path: string) {
  const params = useSearchParams();
  const router = useLocaleRouter();
  const get = (k: string) => params.get(k) ?? "";
  const set = (patch: Record<string, string | undefined>, keepPage = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    if (!keepPage && !("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.replace(`${path}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  return { get, set, params, clear: () => router.replace(path, { scroll: false }) };
}

export function PeriodFilter({ from, to, onChange, children }: { from: string; to: string; onChange: (p: { from: string; to: string }) => void; children?: ReactNode }) {
  const t = useT();
  return (
    <fieldset className="min-w-0 rounded-card border border-line bg-surface p-4">
      <legend className="text-label px-1 font-semibold">{t("adminDash.period")}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
        <TextField label={t("adminDash.from")} type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} />
        <TextField label={t("adminDash.to")} type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} />
      </div>
      <p className="text-caption mt-2 text-ink-soft">{t("adminDash.periodHint")}</p>
      {children}
    </fieldset>
  );
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  const t = useT();
  return <Button variant="outline" size="sm" onClick={onClick} loading={loading}><RefreshCw aria-hidden className="size-4" />{t("adminCommon.refresh")}</Button>;
}
