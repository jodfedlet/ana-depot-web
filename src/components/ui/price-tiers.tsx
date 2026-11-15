"use client";

import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";
import { type PricingSnapshot, priceRanges } from "@/lib/catalog/pricing";
import type { UnitId } from "@/lib/catalog/model";
import { MoneyText, useUnitLabel } from "./price";

/** "Price by quantity" table shown to customers (and previewed in the product editor). */
export function PriceTiersTable({ snapshot, unit, quantity, caption }: { snapshot: PricingSnapshot; unit: UnitId; quantity?: number; caption?: string }) {
  const t = useT();
  const unitLabel = useUnitLabel();
  const ranges = priceRanges(snapshot);
  return (
    <table className="text-label w-full border-collapse font-normal">
      <caption className="text-label mb-2 text-left font-semibold">{caption ?? t("pricing.tiersTitle")}</caption>
      <thead className="sr-only"><tr><th scope="col">{t("pricing.quantityCol")}</th><th scope="col">{t("pricing.priceCol")}</th></tr></thead>
      <tbody>
        {ranges.map((r) => {
          const active = quantity !== undefined && quantity >= r.from && (r.to === undefined || quantity <= r.to);
          return (
            <tr key={r.from} aria-current={active ? "true" : undefined} className={cn("border-t border-line", active && "bg-brand-50 font-semibold")}>
              <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-soft">
                {r.to === undefined ? t("pricing.rangeFrom", { from: r.from }) : r.from === r.to ? String(r.from) : t("pricing.range", { from: r.from, to: r.to })}{" "}
                <span className="text-caption">{unitLabel(unit, r.to === undefined ? 2 : r.to)}</span>
              </th>
              <td className="py-2 text-right"><MoneyText value={{ amount: r.unitPrice, currency: snapshot.currency }} />{r.kind === "wholesale" && <span className="text-caption ml-2 font-semibold text-accent-700">{t("pricing.wholesaleTag")}</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
