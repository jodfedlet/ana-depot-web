import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-sand-100 text-ink-soft",
  brand: "bg-brand-100 text-brand-800",
  accent: "bg-accent-600 text-white",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-caption inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
