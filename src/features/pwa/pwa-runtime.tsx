"use client";

import { WifiOff, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/provider";
import { useSession } from "@/lib/auth/use-session";
import {
  INSTALL_DISMISSED_KEY, VISITS_KEY, isIosSafari, parseCount, parseStamp, shouldOfferInstall,
} from "@/lib/pwa/install";
import { applyUpdate, purgePrivateCaches, registerServiceWorker } from "@/lib/pwa/register";
import { setPwaState, useOnline, usePwaState } from "@/lib/pwa/store";

/** The browser's install event (not in lib.dom). */
interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

const read = (key: string): string | null => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* private mode: the card may come back, harmless */ } };

/**
 * Everything the installable app adds to the page, mounted once in the root layout:
 *  - registers the service worker (production only),
 *  - a strip when offline / showing saved data (never claims data is current),
 *  - "new version available — refresh",
 *  - a dismissible install card (Android/desktop) or "Add to Home Screen" hint (iPhone Safari),
 *  - purges the saved pages and catalog answers when the session ends.
 */
export function PwaRuntime() {
  const t = useT();
  const online = useOnline();
  const { updateReady, savedData } = usePwaState();
  const session = useSession();

  useEffect(() => { void registerServiceWorker(); }, []);
  // Back online: the saved-data notice is over once fresh data can load again (pages refetch on navigation).
  useEffect(() => {
    const onOnline = () => setPwaState({ savedData: false });
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Session ended (signed_in -> signed_out: sign-out button, expired session, signed out in another tab): forget saved pages/catalog answers.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (session.status === "signed_in") wasSignedIn.current = true;
    else if (session.status === "signed_out" && wasSignedIn.current) { wasSignedIn.current = false; void purgePrivateCaches(); }
  }, [session.status]);

  const [laterUpdate, setLaterUpdate] = useState(false);
  const showUpdate = updateReady && !laterUpdate;
  const offline = !online;

  return (
    <>
      {(offline || savedData) && (
        <div role="status" className="flex items-start gap-3 bg-warning-bg px-4 py-2.5 text-warning-fg" data-testid="offline-strip">
          <WifiOff aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p className="text-label min-w-0">
            <span className="font-semibold">{offline ? t("pwa.offlineTitle") : t("pwa.savedTitle")}.</span>{" "}
            {offline ? t("pwa.offlineText") : t("pwa.savedText")}
          </p>
        </div>
      )}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] flex flex-col items-center gap-2 p-3 sm:items-start sm:p-5">
        {showUpdate && (
          <Card testId="update-card" title={t("pwa.updateTitle")} text={t("pwa.updateText")}>
            <Button size="sm" onClick={applyUpdate}>{t("pwa.updateNow")}</Button>
            <Button size="sm" variant="ghost" onClick={() => setLaterUpdate(true)}>{t("pwa.later")}</Button>
          </Card>
        )}
        <Suspense fallback={null}><InstallGuidance /></Suspense>
      </div>
    </>
  );
}

function Card({ title, text, children, testId, onClose }: { title: string; text: string; children: ReactNode; testId: string; onClose?: () => void }) {
  const t = useT();
  return (
    <section role="region" aria-label={title} data-testid={testId} className="pointer-events-auto relative w-full max-w-md rounded-card border border-line bg-surface p-4 shadow-float">
      {onClose && (
        <button type="button" onClick={onClose} aria-label={t("pwa.dismiss")} className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-control text-ink-soft hover:bg-sand-100">
          <X aria-hidden className="size-4" />
        </button>
      )}
      <p className="text-label pr-8 font-semibold">{title}</p>
      <p className="text-caption mt-1 text-ink-soft">{text}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

// ---- install guidance ------------------------------------------------------------------------------------------------------------------------

const noopSubscribe = () => () => {};
const standaloneNow = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** The install bookkeeping lives in localStorage; this store lets React read it (and re-render when it changes, here or in another tab) without effects. */
const metaListeners = new Set<() => void>();
const notifyMeta = () => metaListeners.forEach((l) => l());
const subscribeMeta = (l: () => void) => {
  metaListeners.add(l);
  window.addEventListener("storage", l);
  return () => { metaListeners.delete(l); window.removeEventListener("storage", l); };
};
const visitsNow = () => parseCount(read(VISITS_KEY));
const dismissedNow = () => parseStamp(read(INSTALL_DISMISSED_KEY));

/** Non-intrusive: not on the first visit, not while reserving/signing in/administrating, never again for 60 days after "not now", never when already installed. */
function InstallGuidance() {
  const t = useT();
  const pathname = usePathname();
  const standalone = useSyncExternalStore(noopSubscribe, standaloneNow, () => true);
  const ios = useSyncExternalStore(noopSubscribe, () => isIosSafari(navigator.userAgent, navigator.maxTouchPoints, navigator.platform), () => false);
  const visits = useSyncExternalStore(subscribeMeta, visitsNow, () => 0);
  const dismissedAt = useSyncExternalStore(subscribeMeta, dismissedNow, () => null);
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    // one visit per tab session
    try {
      if (!window.sessionStorage.getItem("ana.pwa.counted")) {
        window.sessionStorage.setItem("ana.pwa.counted", "1");
        write(VISITS_KEY, String(parseCount(read(VISITS_KEY)) + 1));
        notifyMeta();
      }
    } catch { /* storage blocked: no counting, so no prompt */ }
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const offer = shouldOfferInstall({ visits, dismissedAt, now, standalone, pathname });
  const dismiss = () => { write(INSTALL_DISMISSED_KEY, String(Date.now())); notifyMeta(); };
  if (!offer) return null;

  if (event) {
    return (
      <Card testId="install-card" title={t("pwa.installTitle")} text={t("pwa.installText")} onClose={dismiss}>
        <Button size="sm" onClick={async () => { const e = event; setEvent(null); await e.prompt(); const choice = await e.userChoice; if (choice.outcome === "dismissed") dismiss(); }}>{t("pwa.install")}</Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>{t("pwa.notNow")}</Button>
      </Card>
    );
  }
  if (ios) {
    return (
      <Card testId="ios-hint" title={t("pwa.iosTitle")} text={t("pwa.iosText")} onClose={dismiss}>
        <Button size="sm" variant="ghost" onClick={dismiss}>{t("pwa.notNow")}</Button>
      </Card>
    );
  }
  return null;
}

