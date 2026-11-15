"use client";

import Image from "@/components/ui/smart-image";
import { useT } from "@/i18n/provider";
import type { UnitId } from "@/lib/catalog/model";
import type { PriceKind } from "@/lib/catalog/pricing";
import type { Money } from "@/lib/money";
import { multiplyMoney } from "@/lib/money";
import { MoneyText, useUnitLabel } from "./price";

export interface DisplayLine {
  name: string;
  variantLabel?: string;
  quantity: number;
  unitPrice: Money;
  unit?: UnitId;
  priceKind?: PriceKind;
  image: { src: string; alt: string };
}

/** Read-only list of reserved lines: quantity, unit, the unit price that applied, and the line total. */
export function OrderLines({ lines }: { lines: DisplayLine[] }) {
  const t = useT();
  const unitLabel = useUnitLabel();
  return (
    <ul className="divide-y divide-line">
      {lines.map((l, i) => (
        <li key={`${l.name}-${l.variantLabel}-${i}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-control bg-sand-100">
            <Image src={l.image.src} alt={l.image.alt} fill sizes="64px" className="object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-label">{l.name}</p>
            {l.variantLabel && <p className="text-caption text-ink-soft">{l.variantLabel}</p>}
            <p className="text-caption mt-0.5 text-ink-soft">
              {l.quantity} {l.unit ? unitLabel(l.unit, l.quantity) : ""} × <MoneyText value={l.unitPrice} />
              {l.priceKind === "wholesale" && <span className="ml-2 font-semibold text-accent-700">{t("pricing.wholesaleTag")}</span>}
            </p>
          </div>
          <p className="text-label shrink-0"><MoneyText value={multiplyMoney(l.unitPrice, l.quantity)} /></p>
        </li>
      ))}
    </ul>
  );
}
