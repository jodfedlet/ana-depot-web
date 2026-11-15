import { Loader2 } from "lucide-react";
import { Link } from "@/i18n/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "accent" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  secondary: "bg-sand-100 text-ink hover:bg-sand-200",
  outline: "border border-line-strong bg-surface text-ink hover:bg-sand-50",
  ghost: "text-ink hover:bg-sand-100",
  accent: "bg-accent-600 text-white hover:bg-accent-700",
  danger: "border border-danger-fg/40 bg-surface text-danger-fg hover:bg-danger-bg",
};
const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-label",
  md: "min-h-11 px-5 text-label", // 44px touch target
  lg: "min-h-12 px-6 text-[0.9375rem] font-semibold",
};

export function buttonClasses({ variant = "primary", size = "md", full = false }: { variant?: Variant; size?: Size; full?: boolean } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold transition-colors",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    variants[variant],
    sizes[size],
    full && "w-full",
  );
}

interface StyleProps {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

export function Button({
  variant,
  size,
  full,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & StyleProps & { loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, full }), className)}
      {...props}
    >
      {loading && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  full,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={cn(buttonClasses({ variant, size, full }), className)} {...props} />;
}
