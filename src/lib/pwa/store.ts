import { useSyncExternalStore } from "react";

/**
 * What the page knows about the service worker and the network, as a tiny external store (no context, no effects needed to read it).
 *  - `updateReady`: a newer worker is installed and waiting; the UI offers "refresh".
 *  - `savedData`: the worker answered from its saved copy because the network failed (so what is shown may be old).
 */
export interface PwaState { updateReady: boolean; savedData: boolean }

let state: PwaState = { updateReady: false, savedData: false };
const listeners = new Set<() => void>();
export const getPwaState = () => state;
export function setPwaState(patch: Partial<PwaState>) {
  const next = { ...state, ...patch };
  if (next.updateReady === state.updateReady && next.savedData === state.savedData) return;
  state = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const usePwaState = () => useSyncExternalStore(subscribe, getPwaState, getPwaState);

// ---- network ---------------------------------------------------------------------------------------------------------------------------------
const subscribeOnline = (l: () => void) => {
  window.addEventListener("online", l);
  window.addEventListener("offline", l);
  return () => { window.removeEventListener("online", l); window.removeEventListener("offline", l); };
};
/** `navigator.onLine`: false is reliable ("no network"); true only means "a network interface exists". Server render assumes online. */
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
