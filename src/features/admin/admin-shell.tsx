"use client";

import { Bell, ChevronDown, ClipboardList, LayoutDashboard, Menu, Package, Boxes, Settings, Tags, UserCog, Users, Wallet, BarChart3 } from "lucide-react";
import { Suspense, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/states";
import { LanguageSelector } from "@/i18n/language-selector";
import { Link } from "@/i18n/link";
import { useLocalePathname, useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { type AdminSignals, useAdminSignals } from "@/lib/api/admin/signals";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/auth/use-session";
import { useAdminSession } from "./admin-identity";

// ---------- unsaved changes guard ----------
interface GuardValue { setDirty: (dirty: boolean) => void; go: (href: string) => void }
const GuardContext = createContext<GuardValue>({ setDirty: () => undefined, go: () => undefined });

/** Pages with editable forms call this so navigation away asks for confirmation (in-app AND browser unload). */
export function useUnsavedChanges(dirty: boolean) {
  const { setDirty } = useContext(GuardContext);
  useEffect(() => {
    setDirty(dirty);
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => { window.removeEventListener("beforeunload", handler); };
  }, [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
}

// ---------- loading (shown while the server checks access) ----------
export function AdminLoading() {
  const t = useT();
  return <div className="p-8" role="status" aria-label={t("admin.guard.loading")}><Skeleton className="h-8 w-56" /><Skeleton className="mt-4 h-40 w-full" /></div>;
}

// ---------- popover ----------
function Popover({ label, trigger, children, align = "right" }: { label: string; trigger: ReactNode; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 hover:bg-sand-100">{trigger}</button>
      {open && <div className={cn("absolute top-full z-50 mt-2 w-72 rounded-card border border-line bg-surface p-2 shadow-float", align === "right" ? "right-0" : "left-0")}>{children}</div>}
    </div>
  );
}

// ---------- shell ----------
type NavItem = { href: string; key: MessageKey; icon: typeof LayoutDashboard; exact?: boolean; badge?: "pending" | "stock"; alsoActive?: string[] };
const navItems: NavItem[] = [
  { href: "/admin", key: "admin.nav.dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/reservations", key: "admin.nav.reservations", icon: ClipboardList, badge: "pending" },
  { href: "/admin/payments", key: "admin.nav.payments", icon: Wallet },
  { href: "/admin/products", key: "admin.nav.products", icon: Package },
  { href: "/admin/categories", key: "admin.nav.categories", icon: Tags },
  { href: "/admin/inventory", key: "admin.nav.inventory", icon: Boxes, badge: "stock" },
  { href: "/admin/customers", key: "admin.nav.customers", icon: Users },
  { href: "/admin/reports", key: "admin.nav.reports", icon: BarChart3 },
  { href: "/admin/team", key: "adminTeam.nav", icon: UserCog },
  { href: "/admin/settings", key: "admin.nav.storeSettings", icon: Settings, alsoActive: ["/admin/pickup-settings"] },
];

function NavList({ onNavigate, signals }: { onNavigate?: () => void; signals: AdminSignals }) {
  const t = useT();
  const pathname = useLocalePathname();
  const { go } = useContext(GuardContext);
  const badges = { pending: signals.pending ?? 0, stock: signals.stockAttention ?? 0 }; // unknown (loading/failed) shows no badge, never an invented number
  return (
    <nav aria-label={t("admin.nav.label")}>
      <ul className="space-y-1">
        {navItems.map(({ href, key, icon: Icon, exact, badge, alsoActive }) => {
          const active = exact ? pathname === href : pathname.startsWith(href) || (alsoActive ?? []).some((p) => pathname.startsWith(p));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={(e) => { e.preventDefault(); onNavigate?.(); go(href); }}
                className={cn("text-label flex min-h-11 items-center gap-3 rounded-control px-3", active ? "bg-brand-50 font-semibold text-brand-800" : "font-normal text-ink-soft hover:bg-sand-100 hover:text-ink")}
              >
                <Icon aria-hidden className="size-[1.125rem]" />
                <span className="flex-1">{t(key)}</span>
                {badge && badges[badge] > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-accent-600 px-1.5 text-xs font-bold text-white"><span aria-hidden>{badges[badge]}</span></span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useT();
  const router = useLocaleRouter();
  const { session, signOut } = useAdminSession();
  const auth = useSession();
  const signals = useAdminSignals();
  const pending = signals.recent;
  const pendingCount = signals.pending ?? 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const setDirty = useCallback((d: boolean) => { dirtyRef.current = d; }, []);
  const go = (href: string) => {
    if (dirtyRef.current) setLeaveTo(href);
    else router.push(href);
  };
  const guard = { setDirty, go };

  // If the Supabase session ends while the page is open (expiry, revocation, sign-out in another tab), leave the admin.
  const authStatus = auth.status;
  useEffect(() => {
    if (authStatus === "signed_out") router.replace("/auth/login?status=expired&next=%2Fadmin");
  }, [authStatus, router]);

  return (
    <GuardContext.Provider value={guard}>
      <div className="min-h-dvh bg-sand-50 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-line bg-surface p-4 lg:flex">
          <div className="px-1 pt-1"><Wordmark href="/admin" /><p className="text-eyebrow mt-2 pl-[2.625rem] text-ink-muted">{t("admin.brand")}</p></div>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}><NavList signals={signals} /></Suspense>
          <div className="mt-auto"><Link href="/" className="text-label inline-flex min-h-11 items-center px-3 font-semibold text-brand-700 hover:underline">{t("admin.nav.viewStore")} →</Link></div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-6">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label={t("admin.nav.openMenu")} aria-haspopup="dialog" className="-ml-1 grid size-11 place-items-center rounded-full hover:bg-sand-100 lg:hidden"><Menu aria-hidden className="size-6" /></button>
            <span className="text-label font-semibold lg:hidden">{t("admin.brand")}</span>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <LanguageSelector />
              <Popover label={pendingCount > 0 ? `${t("admin.topbar.notifications")} (${pendingCount})` : t("admin.topbar.notifications")} trigger={<><Bell aria-hidden className="size-5" />{pendingCount > 0 && <span aria-hidden data-count={pendingCount} className="grid min-w-5 place-items-center rounded-full bg-accent-600 px-1.5 text-xs font-bold text-white after:content-[attr(data-count)]" />}</>}>
                <p className="text-label px-2 py-1.5 font-semibold">{t("admin.topbar.notifications")}</p>
                {pendingCount === 0 ? <p className="text-label px-2 py-2 font-normal text-ink-soft">{t("admin.topbar.none")}</p> : (
                  <ul>
                    <li className="text-label px-2 py-1 font-normal text-ink-soft" role="status">{t("admin.topbar.pending", { count: pendingCount })}</li>
                    {pending.slice(0, 4).map((r) => (
                      <li key={r.id}><Link href={`/admin/reservations/${r.reference}`} className="text-label flex min-h-11 items-center justify-between rounded-control px-2 hover:bg-sand-50"><span translate="no" className="font-semibold">{r.reference}</span><span className="text-ink-soft">{r.contact.firstName}</span></Link></li>
                    ))}
                    <li><Link href="/admin/reservations?status=pending_review" className="text-label flex min-h-11 items-center rounded-control px-2 font-semibold text-brand-700 hover:bg-sand-50">{t("admin.dashboard.viewAll")}</Link></li>
                  </ul>
                )}
              </Popover>
              <Popover label={t("admin.topbar.account")} trigger={<><span className="grid size-8 place-items-center rounded-full bg-brand-700 text-sm font-semibold text-white">{session?.name.charAt(0)}</span><ChevronDown aria-hidden className="size-4" /></>}>
                <p className="text-label px-2 py-1.5 font-normal text-ink-soft">{t("admin.topbar.signedInAs", { name: session?.name ?? "" })}</p>
                <button type="button" className="text-label flex min-h-11 w-full items-center rounded-control px-2 text-left hover:bg-sand-50" onClick={() => { void signOut(); }}>{t("admin.topbar.signOut")}</button>
              </Popover>
            </div>
          </header>
          <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t("admin.nav.menu")} side="left"><Suspense fallback={<Skeleton className="h-40 w-full" />}><NavList onNavigate={() => setMenuOpen(false)} signals={signals} /></Suspense></Drawer>

      <Drawer
        open={leaveTo !== null}
        onClose={() => setLeaveTo(null)}
        title={t("admin.pickupSettings.unsaved.leaveTitle")}
        side="center"
        footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setLeaveTo(null)}>{t("admin.pickupSettings.unsaved.stay")}</Button><Button variant="danger" onClick={() => { const to = leaveTo; setLeaveTo(null); setDirty(false); if (to) router.push(to); }}>{t("admin.pickupSettings.unsaved.leave")}</Button></div>}
      >
        <p className="text-label font-normal text-ink-soft">{t("admin.pickupSettings.unsaved.leaveText")}</p>
      </Drawer>
    </GuardContext.Provider>
  );
}
