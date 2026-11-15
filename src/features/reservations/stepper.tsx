"use client";

import { Check } from "lucide-react";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";

export function Stepper({ steps, current, onJump }: { steps: string[]; current: number; onJump: (index: number) => void }) {
  const t = useT();
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label={t("reserve.progress")}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const inner = (
          <>
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", done ? "bg-brand-700 text-white" : active ? "bg-ink text-white" : "bg-sand-100 text-ink-soft")}>
              {done ? <Check aria-hidden className="size-4" /> : i + 1}
            </span>
            <span className={cn("text-label hidden sm:inline", active ? "font-semibold" : "font-normal text-ink-soft")}>{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
          </>
        );
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex flex-1 items-center gap-2 last:flex-none sm:gap-3">
            {done ? <button type="button" onClick={() => onJump(i)} className="inline-flex min-h-11 items-center gap-2">{inner}</button> : <span className="inline-flex min-h-11 items-center gap-2">{inner}</span>}
            {i < steps.length - 1 && <span aria-hidden className="h-px flex-1 bg-line-strong" />}
          </li>
        );
      })}
    </ol>
  );
}
