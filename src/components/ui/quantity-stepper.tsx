"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";

/** Stepper with a typeable value (wholesale buyers order 50 or 500, not 5). Commits on blur/Enter, always clamped. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99999,
  label,
  size = "md",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
  size?: "sm" | "md";
}) {
  const t = useT();
  const name = label ?? t("product.quantity");
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.floor(Number.isFinite(n) ? n : min)));
  const commit = () => {
    if (draft === null) return;
    onChange(clamp(draft === "" ? min : Number(draft)));
    setDraft(null);
  };
  const btn = cn("grid place-items-center text-ink-soft hover:bg-sand-100 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent", size === "md" ? "size-11" : "size-9");
  return (
    <div role="group" aria-label={name} className="inline-flex items-center rounded-control border border-line-strong bg-surface">
      <button type="button" className={btn} onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={t("product.decrease")}>
        <Minus aria-hidden className="size-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label={name}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 5))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className={cn("text-label w-14 border-x border-line bg-transparent text-center tabular-nums", size === "md" ? "min-h-11" : "min-h-9")}
      />
      <button type="button" className={btn} onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={t("product.increase")}>
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}
