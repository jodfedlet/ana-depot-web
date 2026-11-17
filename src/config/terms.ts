/**
 * Reservation terms. The legal TEXT and its version label are supplied by the business, not by this application:
 *  - the backend stores, with every reservation, the acknowledgement time and ITS configured label (`ANA_TERMS_VERSION`);
 *  - this storefront must know whether terms exist before it lets a customer tick "I accept". `NEXT_PUBLIC_TERMS_VERSION` is that signal and
 *    must hold the same label as the backend. It is only shown to the customer; the server never reads a version from the browser.
 *  - `NEXT_PUBLIC_TERMS_URL` (optional) is where the published text lives (an absolute https URL, or a path like `/info/terms`).
 * When no version is configured the acknowledgement is not offered and reservations cannot be sent (see `reserve-flow.tsx`): nobody can accept terms that do not exist.
 */
export interface TermsConfig { version: string; url: string | null }

export function readTermsConfig(env: { version?: string; url?: string }): TermsConfig | null {
  const version = env.version?.trim();
  if (!version) return null;
  const raw = env.url?.trim();
  // a local path ("/info/terms") or an https URL; "//host" and "/\\host" are protocol-relative tricks to another site and are refused
  const url = raw && ((/^\/(?![/\\])/.test(raw)) || /^https:\/\//i.test(raw)) ? raw : null;
  return { version, url };
}

/** `NEXT_PUBLIC_*` must be referenced literally so Next inlines them into the browser bundle. */
export const termsConfig = (): TermsConfig | null => readTermsConfig({ version: process.env.NEXT_PUBLIC_TERMS_VERSION, url: process.env.NEXT_PUBLIC_TERMS_URL });
