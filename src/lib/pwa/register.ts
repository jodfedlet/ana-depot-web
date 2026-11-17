import { setPwaState } from "./store";

/**
 * Service worker lifecycle for the page (production builds only: a worker would fight hot reload in `next dev`).
 * The worker itself is `src/pwa/sw.js` served at `/sw.js`; see docs/pwa.md.
 */
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && window.isSecureContext;

let registration: ServiceWorkerRegistration | null = null;
let reloading = false;
let started = false;

export async function registerServiceWorker(): Promise<void> {
  if (started || !supported() || process.env.NODE_ENV !== "production") return;
  started = true;
  const wasControlled = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    const type = (event.data as { type?: string } | null)?.type;
    if (type === "SERVED_FROM_CACHE") setPwaState({ savedData: true });
    if (type === "STATUS" && (event.data as { stale?: boolean }).stale) setPwaState({ savedData: true });
  });
  // A new worker took over (after "refresh"): reload ONCE so the page and its assets are the same version.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloading && wasControlled) { reloading = true; window.location.reload(); }
  });

  try {
    registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    return; // no worker: the site works exactly as before
  }
  const reg = registration;
  const flag = () => { if (reg.waiting && navigator.serviceWorker.controller) setPwaState({ updateReady: true }); };
  flag();
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => { if (worker.state === "installed") flag(); });
  });

  // Look for a new version when the tab comes back and hourly: a long-lived installed app must not stay old.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reg.update().catch(() => {}); });
  window.setInterval(() => { void reg.update().catch(() => {}); }, 60 * 60 * 1000);

  const ready = await navigator.serviceWorker.ready;
  ready.active?.postMessage({ type: "PING" });
  if (!wasControlled) {
    // First visit: this page was loaded before the worker existed, so tell it what the page already loaded (it only keeps what its rules allow).
    const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/_next/static/"));
    ready.active?.postMessage({ type: "CACHE_LOADED", urls, page: window.location.href });
  }
}

/** "Refresh" on the update card: the waiting worker takes over, then the page reloads once (see `controllerchange`). */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) { window.location.reload(); return; }
  waiting.postMessage({ type: "SKIP_WAITING" });
}

/**
 * Session ended (sign-out, expired session): forget every saved page and catalog answer. Done twice on purpose: the page deletes the caches itself
 * (works without a controlling worker) and the worker is told too. Best effort, never throws.
 */
export async function purgePrivateCaches(): Promise<void> {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "PURGE_PRIVATE" });
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(names.filter((n) => /^ana-.+-(pages|api)$/.test(n)).map((n) => caches.delete(n)));
  } catch {
    /* nothing more to do */
  }
}
