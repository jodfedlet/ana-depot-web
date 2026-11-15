"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";

const control =
  "w-full min-h-11 rounded-control border bg-surface px-3 text-body text-ink placeholder:text-ink-muted " +
  "disabled:bg-sand-50 disabled:text-ink-muted";

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
}

function Shell({
  id,
  label,
  hint,
  error,
  optional,
  className,
  children,
}: FieldShellProps & { id: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className={className}>
      <label htmlFor={id} className="text-label mb-1.5 flex items-baseline justify-between gap-2 text-ink">
        <span>{label}</span>
        {optional && <span className="text-caption font-normal text-ink-muted">{t("common.optional")}</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-caption mt-1.5 text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-caption mt-1.5 font-medium text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TextField({
  label,
  hint,
  error,
  optional,
  className,
  id: idProp,
  ...props
}: FieldShellProps & Omit<ComponentProps<"input">, "className">) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Shell {...{ id, label, hint, error, optional, className }}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, error ? "border-danger-fg" : "border-line-strong")}
        {...props}
      />
    </Shell>
  );
}

export function PasswordField({
  label,
  hint,
  error,
  className,
  ...props
}: FieldShellProps & Omit<ComponentProps<"input">, "className" | "type">) {
  const t = useT();
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <Shell {...{ id, label, hint, error, className }}>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(control, "pr-12", error ? "border-danger-fg" : "border-line-strong")}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-soft hover:text-ink"
        >
          {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
        </button>
      </div>
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  className,
  children,
  ...props
}: FieldShellProps & Omit<ComponentProps<"select">, "className">) {
  const id = useId();
  return (
    <Shell {...{ id, label, hint, error, optional, className }}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, error ? "border-danger-fg" : "border-line-strong")}
        {...props}
      >
        {children}
      </select>
    </Shell>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: { label: ReactNode; description?: string; className?: string } & Omit<ComponentProps<"input">, "type" | "className">) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 rounded border-line-strong accent-brand-700"
        {...props}
      />
      <label htmlFor={id} className="text-label cursor-pointer text-ink">
        {label}
        {description && <span className="text-caption mt-0.5 block font-normal text-ink-muted">{description}</span>}
      </label>
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  optional,
  className,
  rows = 3,
  ...props
}: FieldShellProps & Omit<ComponentProps<"textarea">, "className">) {
  const id = useId();
  return (
    <Shell {...{ id, label, hint, error, optional, className }}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, "min-h-0 py-2.5 leading-relaxed", error ? "border-danger-fg" : "border-line-strong")}
        {...props}
      />
    </Shell>
  );
}
