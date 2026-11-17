/**
 * The attempt in flight for "Send the reservation". One Idempotency-Key per attempt, reused for every retry of THAT request, so a retry after a
 * timeout can only return the original reservation. The key is tied to the exact request (a fingerprint): a changed request gets a new key,
 * because the server refuses the same key with a different body. Kept in sessionStorage so a reload between "sent" and "answered" cannot lose it.
 */
const KEY = "ana.pending-submit.v1";
interface Pending { key: string; fingerprint: string }

const read = (): Pending | null => {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Pending>) : null;
    return p && typeof p.key === "string" && typeof p.fingerprint === "string" ? { key: p.key, fingerprint: p.fingerprint } : null;
  } catch {
    return null;
  }
};

/** The key to send for this exact request: the pending one when the request is unchanged, otherwise a fresh one (remembered). */
export function keyFor(fingerprint: string, newKey: () => string): string {
  const pending = read();
  if (pending && pending.fingerprint === fingerprint) return pending.key;
  const key = newKey();
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ key, fingerprint })); } catch { /* without storage the key lives only for this page */ }
  return key;
}
/** True while a request was sent and its outcome is not known (it is cleared on any definite answer). */
export const hasPending = (): boolean => read() !== null;
export function clearPending() {
  try { window.sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
