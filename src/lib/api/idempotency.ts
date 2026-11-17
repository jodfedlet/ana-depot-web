/**
 * Idempotency keys for administrative writes that may be retried (payments, reversals, stock adjustments, lifecycle transitions, notes, creates).
 * Rule: ONE key per logical attempt. If a request left the browser and no answer came back, the next click on the SAME request reuses the SAME key,
 * so the server can only return the original result — it can never apply the write twice. A changed request (different payload) gets a new key, because the
 * server refuses one key with two different bodies. A definite answer (success or a refusal) ends the attempt. Kept in sessionStorage so a reload
 * between "sent" and "answered" cannot lose the key. Never mint a new key just because the previous response did not arrive.
 */
const STORE = "ana.admin-idempotency.v1";
type Slot = { key: string; fingerprint: string };
type Slots = Record<string, Slot>;

const read = (): Slots => {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORE) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Slots) : {};
  } catch {
    return {};
  }
};
const write = (slots: Slots) => {
  try { window.sessionStorage.setItem(STORE, JSON.stringify(slots)); } catch { /* storage blocked: the key then lives only for this page */ }
};
const memory = new Map<string, Slot>();

/** The key for this exact request in this scope (e.g. `payment:<reservationId>`): the pending one if the request is unchanged, else a new one. */
export function attemptKey(scope: string, payload: unknown, newKey: () => string = () => crypto.randomUUID()): string {
  const fingerprint = JSON.stringify(payload);
  const slots = read();
  const existing = slots[scope] ?? memory.get(scope);
  if (existing && existing.fingerprint === fingerprint) return existing.key;
  const slot = { key: newKey(), fingerprint };
  memory.set(scope, slot);
  write({ ...slots, [scope]: slot });
  return slot.key;
}

/** The attempt got a definite answer: the next one is a new request. */
export function endAttempt(scope: string) {
  memory.delete(scope);
  const slots = read();
  delete slots[scope];
  write(slots);
}
