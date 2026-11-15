"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center", className)}>
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-full bg-sand-100 text-ink-soft [&_svg]:size-6">{icon}</div>}
      <h2 className="text-h2">{title}</h2>
      {description && <div className="text-body mt-2 text-ink-soft">{description}</div>}
      {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>}
    </div>
  );
}

export function ErrorState({ title, message, onRetry, className }: { title?: string; message?: string; onRetry?: () => void; className?: string }) {
  const t = useT();
  return (
    <div role="alert" className={cn("mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center", className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-danger-bg text-danger-fg">
        <TriangleAlert aria-hidden className="size-6" />
      </div>
      <h2 className="text-h2">{title ?? t("errorPage.title")}</h2>
      <p className="text-body mt-2 text-ink-soft">{message ?? t("errorPage.text")}</p>
      {onRetry && (
        <Button className="mt-6" onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}
