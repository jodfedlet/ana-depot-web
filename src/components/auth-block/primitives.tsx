import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * The four presentational primitives the Supabase UI "password-based auth" block expects from shadcn/ui (`card`, `input`, `label`;
 * the block's `button` is our own `components/ui/button`). They are written here against OUR design tokens instead of installing
 * shadcn/ui (which would add radix-ui, class-variance-authority, clsx, tailwind-merge and a second theme to globals.css).
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-line bg-surface shadow-card", className)} {...props} />;
}
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pb-0 sm:p-7 sm:pb-0", className)} {...props} />;
}
export function CardTitle({ className, ...props }: ComponentProps<"h1">) {
  return <h1 className={cn("text-h2", className)} {...props} />;
}
export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-body text-ink-soft", className)} {...props} />;
}
export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5 sm:p-7", className)} {...props} />;
}
export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-label font-medium text-ink", className)} {...props} />;
}
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-muted",
        "aria-[invalid=true]:border-danger-fg disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
/** Inline error text, announced to assistive technology and linked to its input through aria-describedby. */
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return <p id={id} role="alert" className="text-caption font-medium text-danger-fg">{children}</p>;
}
