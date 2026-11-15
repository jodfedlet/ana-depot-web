"use client";

import { CheckCircle2, FlaskConical, Info, TriangleAlert, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";

type AlertTone = "info" | "success" | "warning" | "danger";
const styles: Record<AlertTone, { box: string; Icon: typeof Info }> = {
  info: { box: "bg-info-bg text-info-fg", Icon: Info },
  success: { box: "bg-success-bg text-success-fg", Icon: CheckCircle2 },
  warning: { box: "bg-warning-bg text-warning-fg", Icon: TriangleAlert },
  danger: { box: "bg-danger-bg text-danger-fg", Icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  live,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
  /** "assertive" for errors that need immediate attention, "polite" for results. */
  live?: "polite" | "assertive";
}) {
  const { box, Icon } = styles[tone];
  return (
    <div
      role={live === "assertive" ? "alert" : live === "polite" ? "status" : undefined}
      className={cn("flex gap-3 rounded-card p-4", box, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="text-label min-w-0 space-y-1 font-normal">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

/** Marks anything that is simulated. Use it wherever mock behaviour could be mistaken for real. */
export function DemoNotice({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  const t = useT();
  return (
    <div className={cn("flex gap-3 rounded-card border border-dashed border-line-strong bg-sand-50 p-4", className)}>
      <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-soft" />
      <div className="text-label min-w-0 space-y-1 font-normal text-ink-soft">
        <p className="font-semibold text-ink">{title ?? t("demo.title")}</p>
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
