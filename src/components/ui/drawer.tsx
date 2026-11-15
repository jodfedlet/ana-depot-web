"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";

type Side = "left" | "right" | "bottom" | "top" | "center";

const sideClasses: Record<Side, string> = {
  left: "inset-y-0 left-0 h-dvh max-h-none w-[min(22rem,92vw)]",
  right: "inset-y-0 right-0 h-dvh max-h-none w-[min(26rem,92vw)]",
  bottom: "inset-x-0 bottom-0 top-auto max-h-[88dvh] w-full rounded-t-2xl",
  top: "inset-x-0 top-0 bottom-auto max-h-dvh w-full",
  center: "inset-0 m-auto h-fit max-h-[92dvh] w-[min(34rem,94vw)] rounded-card",
};

/**
 * Accessible modal panel built on the native <dialog>: focus is trapped, Escape closes,
 * the page behind is inert, and focus returns to the trigger. Children mount only while open.
 */
export function Drawer({
  open,
  onClose,
  title,
  side = "right",
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: Side;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on backdrop
      }}
      className={cn(
        "fixed max-w-none flex-col overflow-hidden border-0 bg-surface p-0 text-ink shadow-float open:flex", side !== "center" && "m-0",
        sideClasses[side],
      )}
    >
      {open && (
        <>
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-h3">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="-mr-2 grid size-11 place-items-center rounded-control text-ink-soft hover:bg-sand-100 hover:text-ink"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
          {footer && <div className="shrink-0 border-t border-line bg-surface px-4 py-3">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
