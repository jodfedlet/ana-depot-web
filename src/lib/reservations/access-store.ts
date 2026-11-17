/**
 * Proof of access for guest reservations, kept for THIS TAB only (sessionStorage): after a guest submits or looks up a reservation, the reference
 * and the phone they typed are remembered so the confirmation and tracking pages can ask the server again without re-typing. It stores credentials,
 * never reservation data: every screen shows what the API answers at that moment. Closing the tab forgets everything; a wrong phone is forgotten at once.
 */
const KEY = "ana.guest-access.v1";
type Access = Record<string, string>;

const read = (): Access => {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Access) : {};
  } catch {
    return {};
  }
};
const write = (a: Access) => {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage blocked: the visitor will be asked for the phone again */ }
};

export const normalizeReference = (reference: string) => reference.replace(/\s+/g, "").toUpperCase();

export function rememberAccess(reference: string, phone: string) {
  write({ ...read(), [normalizeReference(reference)]: phone });
}
export function recallAccess(reference: string): string | undefined {
  return read()[normalizeReference(reference)];
}
export function forgetAccess(reference: string) {
  const a = read();
  delete a[normalizeReference(reference)];
  write(a);
}
export function forgetAllAccess() {
  try { window.sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

/**
 * What the server answered when the reservation was created (the 201 body), kept for THIS TAB so the confirmation page can show it without spending
 * a tracking lookup (those are rate limited per address). It is the server's own response, not data rebuilt locally; the tracking page always asks the server again.
 */
const SUBMITTED_KEY = "ana.just-submitted.v1";
export function rememberSubmitted(dto: unknown, reference: string) {
  try { window.sessionStorage.setItem(SUBMITTED_KEY, JSON.stringify({ reference: normalizeReference(reference), dto })); } catch { /* the confirmation then asks for the phone on the tracking page */ }
}
/** The stored submission answer as a JSON string (a stable primitive, so it can back `useSyncExternalStore`), or null. */
export function recallSubmittedRaw(reference: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(SUBMITTED_KEY);
    const parsed = raw ? (JSON.parse(raw) as { reference?: string; dto?: unknown }) : null;
    return parsed && parsed.reference === normalizeReference(reference) && parsed.dto ? JSON.stringify(parsed.dto) : null;
  } catch {
    return null;
  }
}
