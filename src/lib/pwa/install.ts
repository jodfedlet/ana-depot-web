/** Pure rules for the install guidance (tested in install.test.ts). The browser parts live in `features/pwa`. */

export const INSTALL_DISMISSED_KEY = "ana.pwa.install-dismissed"; // ms epoch of the last "not now"
export const VISITS_KEY = "ana.pwa.visits"; // number of separate visits (one per tab session)

/** After "not now" the guidance stays away for this long. */
export const DISMISS_MS = 60 * 24 * 60 * 60 * 1000;
/** Never on the first visit: the shop is shown before it asks anything. */
export const MIN_VISITS = 2;

/** Pages where an install card would interrupt a task (reserving, tracking, signing in, administration). */
const QUIET = /^\/(fr|ht)\/(reserve|reservations|auth|admin|account)(\/|$)/;
export const isQuietPath = (pathname: string): boolean => QUIET.test(pathname);

export interface OfferInput {
  visits: number;
  dismissedAt: number | null;
  now: number;
  standalone: boolean;
  pathname: string;
}
export function shouldOfferInstall({ visits, dismissedAt, now, standalone, pathname }: OfferInput): boolean {
  if (standalone || isQuietPath(pathname)) return false;
  if (visits < MIN_VISITS) return false;
  return dismissedAt === null || !(now - dismissedAt < DISMISS_MS);
}

/** iPhone/iPad Safari (where there is no install prompt event and the user must use "Add to Home Screen"). Other iOS browsers cannot install. */
export function isIosSafari(ua: string, maxTouchPoints = 0, platform = ""): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1); // iPadOS reports as a Mac
  if (!ios) return false;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA/.test(ua);
}

export function parseCount(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
export function parseStamp(raw: string | null): number | null {
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n > 0 ? n : null;
}
