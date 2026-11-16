"use client";

import { ChevronRight, LogIn, PackageOpen } from "lucide-react";
import { useState } from "react";
import { DemoNotice } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { MoneyTotals } from "@/components/ui/price";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { PaymentStatusBadge, ReservationStatusBadge } from "@/features/reservations/shared";
import { dialCodes } from "@/config/market";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLocalePathname, useLocaleRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";
import { type Reservation, reservationItemCount } from "@/lib/reservations/types";
import { useProfile } from "@/lib/stores/account-store";
import { useReservations } from "@/lib/stores/reservation-store";
import { useSession } from "@/lib/auth/use-session";
import { focusFirstInvalid, isBlank, isValidPhone } from "@/lib/validation";

/**
 * Client-side companion of the server gate in the account layout: shows the page once Supabase has confirmed the user.
 * The authoritative check (valid session cookie) happens on the server before this renders.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { status } = useSession();
  if (status === "loading") return <div role="status" aria-label={t("common.loading")}><Skeleton className="h-8 w-56" /><Skeleton className="mt-4 h-40 w-full" /></div>;
  if (status === "signed_out") {
    return (
      <EmptyState icon={<LogIn aria-hidden />} title={t("account.gate.title")} description={t("account.gate.text")}>
        <ButtonLink href="/sign-in">{t("nav.signIn")}</ButtonLink>
        <ButtonLink href="/register" variant="outline">{t("footer.createAccount")}</ButtonLink>
      </EmptyState>
    );
  }
  return <>{children}</>;
}

export function AccountNav() {
  const t = useT();
  const pathname = useLocalePathname();
  const router = useLocaleRouter();
  const { session, signOut } = useSession();
  const items = [
    { href: "/account", label: t("account.nav.overview"), exact: true },
    { href: "/account/reservations", label: t("account.nav.reservations") },
    { href: "/account/profile", label: t("account.nav.profile") },
  ];
  return (
    <nav aria-label={t("account.nav.label")} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {items.map((i) => {
          const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
          return (
            <li key={i.href} className="shrink-0">
              <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("text-label flex min-h-11 items-center rounded-control px-3.5 hover:bg-sand-100", active ? "bg-sand-100 font-semibold" : "font-normal text-ink-soft")}>{i.label}</Link>
            </li>
          );
        })}
        {session && (
          <li className="shrink-0 lg:mt-3 lg:border-t lg:border-line lg:pt-3">
            <button type="button" onClick={async () => { if (await signOut()) { router.push("/sign-in?status=signed_out"); router.refresh(); } }} className="text-label flex min-h-11 w-full items-center rounded-control px-3.5 font-normal text-ink-soft hover:bg-sand-100">{t("account.nav.signOut")}</button>
          </li>
        )}
      </ul>
    </nav>
  );
}

/** Reservations belonging to the signed-in customer (matched by email in this demo). */
function useMyReservations(): Reservation[] {
  const { session } = useSession();
  const all = useReservations();
  if (!session) return [];
  return all.filter((r) => r.customer.email?.toLowerCase() === session.email.toLowerCase()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function ReservationRow({ r }: { r: Reservation }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <li>
      <Link href={`/reservations/${r.reference}`} className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-sand-50">
        <div className="min-w-0 flex-1">
          <p className="text-label font-semibold" translate="no">{r.reference}</p>
          <p className="text-caption text-ink-soft">{fmt.date(r.createdAt, "short")} · {t("account.reservations.items", { count: reservationItemCount(r) })}</p>
        </div>
        <div className="hidden sm:block"><PaymentStatusBadge status={r.payment.status} /></div>
        <ReservationStatusBadge status={r.status} />
        <p className="text-label hidden w-32 text-right sm:block"><MoneyTotals totals={r.totals} /></p>
        <ChevronRight aria-hidden className="size-4 text-ink-muted" />
      </Link>
    </li>
  );
}

export function OverviewView() {
  const t = useT();
  const { session } = useSession();
  const { profile } = useProfile();
  const mine = useMyReservations();
  return (
    <RequireSession>
      <h1 className="text-h1">{t("account.overview.hello", { name: profile.firstName || session?.firstName || "" })}</h1>
      <p className="text-body mt-1 text-ink-soft">{t("account.overview.intro")}</p>
      <DemoNotice className="mt-5">{t("demo.data")}</DemoNotice>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-h3">{t("account.overview.profileCard")}</h2>
          <p className="text-label mt-2 font-normal text-ink-soft">{profile.firstName} {profile.lastName}<br />{profile.email}<br />{profile.dialCode} {profile.phone}</p>
          <Link href="/account/profile" className="text-label mt-3 inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">{t("account.overview.editProfile")}</Link>
        </section>
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-h3">{t("nav.trackReservation")}</h2>
          <p className="text-label mt-2 font-normal text-ink-soft">{t("track.lookup.intro")}</p>
          <Link href="/reservations" className="text-label mt-3 inline-flex min-h-9 items-center font-semibold text-brand-700 underline underline-offset-2">{t("account.overview.track")}</Link>
        </section>
      </div>
      <section className="mt-8" aria-labelledby="recent-title">
        <div className="mb-3 flex items-baseline justify-between"><h2 id="recent-title" className="text-h2">{t("account.overview.recent")}</h2><Link href="/account/reservations" className="text-label font-semibold text-brand-700 underline underline-offset-2">{t("account.overview.viewAll")}</Link></div>
        {mine.length === 0 ? <p className="text-label font-normal text-ink-soft">{t("account.reservations.empty")}</p> : <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{mine.slice(0, 3).map((r) => <ReservationRow key={r.id} r={r} />)}</ul>}
      </section>
    </RequireSession>
  );
}

export function ReservationsView() {
  const t = useT();
  const mine = useMyReservations();
  return (
    <RequireSession>
      <h1 className="text-h1">{t("account.reservations.title")}</h1>
      {mine.length === 0 ? (
        <EmptyState icon={<PackageOpen aria-hidden />} title={t("account.reservations.empty")} description={t("account.reservations.emptyText")}><ButtonLink href="/products">{t("cart.continueBrowsing")}</ButtonLink></EmptyState>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{mine.map((r) => <ReservationRow key={r.id} r={r} />)}</ul>
      )}
    </RequireSession>
  );
}

export function ProfileView() {
  const t = useT();
  return (
    <RequireSession>
      <h1 className="text-h1">{t("account.profile.title")}</h1>
      <DemoNotice className="mt-5">{t("demo.data")}</DemoNotice>
      <ProfileForm />
    </RequireSession>
  );
}

/** Mounted only after the session gate, so its initial draft reads real stored data. */
function ProfileForm() {
  const t = useT();
  const { profile, updateProfile } = useProfile();
  const toast = useToast();
  const [draft, setDraft] = useState(profile);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (isBlank(draft.firstName)) next.firstName = t("validation.firstName");
    if (isBlank(draft.lastName)) next.lastName = t("validation.lastName");
    if (!isBlank(draft.phone) && !isValidPhone(draft.phone)) next.phone = t("validation.phone");
    setErrors(next);
    if (Object.keys(next).length) { const f = e.currentTarget; window.setTimeout(() => focusFirstInvalid(f)); return; }
    updateProfile(draft);
    toast.show({ tone: "success", message: t("account.profile.saved") });
  };
  const edit = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setDraft({ ...draft, [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: "" })); };
  return (
    <form onSubmit={submit} noValidate className="mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
      <TextField label={t("account.profile.firstName")} autoComplete="given-name" value={draft.firstName} onChange={edit("firstName")} error={errors.firstName} />
      <TextField label={t("account.profile.lastName")} autoComplete="family-name" value={draft.lastName} onChange={edit("lastName")} error={errors.lastName} />
      <TextField label={t("account.profile.email")} className="sm:col-span-2" type="email" value={draft.email} readOnly hint={t("account.profile.emailHint")} />
      <div className="grid grid-cols-[7.5rem_1fr] gap-3 sm:col-span-2">
        <SelectField label={t("account.profile.dialCode")} value={draft.dialCode} onChange={edit("dialCode")}>{dialCodes.map((d) => <option key={d}>{d}</option>)}</SelectField>
        <TextField label={t("account.profile.phone")} type="tel" autoComplete="tel-national" value={draft.phone} onChange={edit("phone")} error={errors.phone} />
      </div>
      <div className="sm:col-span-2"><Button type="submit" size="lg">{t("account.profile.save")}</Button></div>
    </form>
  );
}
