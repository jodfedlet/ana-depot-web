/** Small, dependency-free validators shared by forms. Server-side validation remains authoritative. */
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export const isBlank = (v: string | undefined) => !v || v.trim() === "";

/** International phone: optional leading +, digits, spaces, dashes, parentheses; 6–15 digits (E.164 max 15). */
export function isValidPhone(v: string): boolean {
  if (!/^\+?[\d\s().-]+$/.test(v.trim())) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

export type Errors<T extends string> = Partial<Record<T, string>>;

/** Focus the first invalid control after a failed submit (a11y). */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  form?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
}
