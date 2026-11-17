import { currencyDigits } from "../money";

/**
 * The API sends money as decimal strings ("25000.00"). The UI works in integer minor units (see money.ts). This converts one into the
 * other WITHOUT floating point, and refuses anything that is not a plain non-negative decimal with at most the currency's digits —
 * a malformed amount must never become a plausible-looking price.
 */
export function decimalToMinor(value: string | null | undefined, currency: string): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,15})(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const digits = currencyDigits(currency);
  const fraction = match[2] ?? "";
  // "25.500" is fine (trailing zeros), "25.505" has a sub-minor part this currency cannot show: refuse rather than round.
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) return null;
  const minor = Number(`${match[1]}${fraction.slice(0, digits).padEnd(digits, "0")}`);
  return Number.isSafeInteger(minor) ? minor : null;
}
