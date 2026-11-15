"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "success" | "info" | "error";
interface Toast {
  id: number;
  tone: Tone;
  message: string;
  action?: { label: string; href: string };
}

const ToastContext = createContext<{ show: (t: Omit<Toast, "id">) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const icons = { success: CheckCircle2, info: Info, error: TriangleAlert };
const tones: Record<Tone, string> = {
  success: "text-success-fg",
  info: "text-info-fg",
  error: "text-danger-fg",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Live region: announced politely by screen readers */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((item) => {
          const Icon = icons[item.tone];
          return (
            <div
              key={item.id}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-line bg-surface p-3.5 shadow-float"
            >
              <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${tones[item.tone]}`} />
              <p className="text-label flex-1 text-ink">{item.message}</p>
              {item.action && (
                <Link href={item.action.href} className="text-label font-semibold text-brand-700 underline underline-offset-2">
                  {item.action.label}
                </Link>
              )}
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label={t("common.dismiss")}
                className="-m-1 grid size-7 place-items-center rounded text-ink-muted hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
