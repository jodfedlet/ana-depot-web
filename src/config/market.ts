/**
 * Launch-market configuration. Haiti is the launch market, NOT a hard assumption:
 * adding a country means extending these values and the backend's per-country settings.
 */
import { type CurrencyCode, SUPPORTED_CURRENCIES } from "@/lib/money";

export const market = {
  launchCountry: "HT",
  /**
   * Currencies sold at launch: HTG and USD (see `SUPPORTED_CURRENCIES` in lib/money). Each product has its own currency;
   * there is NO exchange rate and no conversion between them.
   */
  currencies: SUPPORTED_CURRENCIES,
  /** Pre-selected currency in the new-product form only (the seller can change it). Not a business rule. */
  defaultProductCurrency: "HTG" as CurrencyCode,
  /** Pre-selected phone dial code in forms (still editable). */
  defaultDialCode: "+509",
  /** IANA time zone used to display timestamps. */
  timeZone: "America/Port-au-Prince",
  /** Countries the store can currently serve (pickup only, one country at launch). */
  servedCountries: ["HT"],
} as const;

/** Small sample list for phone codes and the store-country selector. */
export const countryOptions = [
  { code: "HT", dialCode: "+509" },
  { code: "DO", dialCode: "+1" },
  { code: "US", dialCode: "+1" },
  { code: "CA", dialCode: "+1" },
  { code: "FR", dialCode: "+33" },
] as const;

export const dialCodes = [...new Set(countryOptions.map((c) => c.dialCode))];
