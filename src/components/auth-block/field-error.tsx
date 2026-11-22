/** Inline error text, announced to assistive technology and linked to its input through aria-describedby. */
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return <p id={id} role="alert" className="text-caption font-medium text-destructive">{children}</p>;
}
