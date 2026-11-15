/**
 * Money is always an integer amount in the currency's minor unit plus an ISO 4217 code.
 * There is intentionally NO currency conversion here and no exchange rate anywhere in the app: amounts of
 * different currencies are never added, compared or merged. Totals are kept PER currency (`sumByCurrency`).
 */

/** Currencies supported at launch (confirmed business decision). Adding one = extend this list + messages are generic. */
export const SUPPORTED_CURRENCIES = ["HTG", "USD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];
export const isSupportedCurrency = (c: string): c is CurrencyCode => (SUPPORTED_CURRENCIES as readonly string[]).includes(c);

export interface Money {
  /** Integer in minor units (e.g. cents). */
  amount: number;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
}

/** Number formatting locale. Haitian Creole has no Intl data, so it shares French (Haiti) conventions. */
export const DEFAULT_LOCALE = "fr-HT";
const INTL_LOCALE: Record<string, string> = { fr: "fr-HT", ht: "fr-HT" };
const intl = (locale: string) => INTL_LOCALE[locale] ?? locale;

export function currencyDigits(currency: string, locale: string = DEFAULT_LOCALE): number {
  return minorDigits(currency, locale);
}

function minorDigits(currency: string, locale: string): number {
  return (
    new Intl.NumberFormat(intl(locale), { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/**
 * Always shows the ISO code ("1 800,00 HTG", "25,00 USD") rather than a symbol, so the currency is never ambiguous
 * (`G` and `$` are easy to misread, and two currencies share this storefront).
 */
export function formatMoney(money: Money, locale: string = DEFAULT_LOCALE): string {
  const digits = minorDigits(money.currency, locale);
  return new Intl.NumberFormat(intl(locale), {
    style: "currency",
    currency: money.currency,
    currencyDisplay: "code",
  }).format(money.amount / 10 ** digits);
}

export function money(amount: number, currency: string): Money {
  return { amount: Math.round(amount), currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} and ${b.currency}: amounts in different currencies are never combined.`);
  }
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function multiplyMoney(m: Money, factor: number): Money {
  return { amount: Math.round(m.amount * factor), currency: m.currency };
}

/**
 * Totals grouped by currency, in the order of SUPPORTED_CURRENCIES (others alphabetically). Never converts:
 * a mixed list yields one entry per currency. Empty input yields an empty list.
 */
export function sumByCurrency(items: readonly Money[]): Money[] {
  const totals = new Map<string, number>();
  for (const m of items) totals.set(m.currency, (totals.get(m.currency) ?? 0) + m.amount);
  const rank = (c: string) => { const i = (SUPPORTED_CURRENCIES as readonly string[]).indexOf(c); return i === -1 ? SUPPORTED_CURRENCIES.length : i; };
  return [...totals.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)).map(([currency, amount]) => ({ amount, currency }));
}

/** Amount in a given currency out of a per-currency list (0 when the currency is absent). */
export const amountIn = (totals: readonly Money[], currency: string): number => totals.find((t) => t.currency === currency)?.amount ?? 0;

/** Whole-number discount percentage between a previous and current price (0 if none). */
export function discountPercent(current: Money, previous?: Money): number {
  if (!previous || previous.currency !== current.currency || previous.amount <= current.amount) {
    return 0;
  }
  return Math.round((1 - current.amount / previous.amount) * 100);
}

/** Convert a user-entered major-unit value (e.g. 12.5) to minor units for a currency. */
export function majorToMinor(major: number, currency: string, locale: string = DEFAULT_LOCALE): number {
  // Decimal-exponent shift instead of `major * 10 ** n`: 1.005 * 100 is 100.49999… in binary floating point.
  return Math.round(Number(`${major}e${minorDigits(currency, locale)}`));
}

export function minorToMajor(minor: number, currency: string, locale: string = DEFAULT_LOCALE): number {
  return minor / 10 ** minorDigits(currency, locale);
}
