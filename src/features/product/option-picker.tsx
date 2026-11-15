"use client";

import { Check } from "lucide-react";
import { useT } from "@/i18n/provider";
import type { Product } from "@/lib/catalog-types";
import { cn } from "@/lib/cn";
import { optionValueAvailable } from "@/lib/product";

/** One radio group per option (Size, Color...). Works for any option names; swatches are optional. */
export function OptionPicker({ product, selection, onSelect }: { product: Product; selection: Record<string, string>; onSelect: (name: string, value: string) => void }) {
  const t = useT();
  return (
    <div className="space-y-5">
      {product.options.map((option) => (
        <div key={option.name} role="radiogroup" aria-labelledby={`opt-${option.name}`}>
          <p id={`opt-${option.name}`} className="text-label mb-2">
            {option.name}: <span className="font-normal text-ink-soft">{selection[option.name]}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {option.values.map((v) => {
              const selected = selection[option.name] === v.value;
              const available = optionValueAvailable(product, option.name, v.value, selection);
              return (
                <button
                  key={v.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={available ? `${option.name} ${v.value}` : t("product.optionOut", { option: option.name, value: v.value })}
                  onClick={() => onSelect(option.name, v.value)}
                  className={cn(
                    "text-label relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border px-3.5",
                    selected ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-line-strong bg-surface hover:border-ink-muted",
                    !available && "text-ink-muted line-through decoration-ink-muted/60",
                  )}
                >
                  {v.swatch && (
                    <span aria-hidden className="grid size-5 place-items-center rounded-full border border-black/10" style={{ background: v.swatch }}>
                      {selected && <Check className={cn("size-3", isDark(v.swatch) ? "text-white" : "text-ink")} />}
                    </span>
                  )}
                  {v.value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}
