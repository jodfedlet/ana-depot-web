"use client";

import { ChevronRight, LogIn, PackageOpen } from "lucide-react";
import { useState } from "react";
import { LogoutButton } from "@/components/auth-block/logout-button";
import { Alert } from "@/components/ui/alert";
import { ApiErrorState } from "@/components/ui/api-error";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { MoneyTotals } from "@/components/ui/price";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { PaymentStatusBadge, ReservationStatusBadge } from "@/features/reservations/shared";
import { dialCodes } from "@/config/market";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/link";
import { useLocalePathname } from "@/i18n/navigation";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/cn";
import { useCustomerProfile } from "@/lib/api/account-hooks";
import { apiErrorKey, fieldProblems, isSessionProblem } from "@/lib/api/errors";
import { saveProfile } from "@/lib/api/public";
import { useMyReservations } from "@/lib/api/reservation-hooks";
import type { CustomerReservation } from "@/lib/reservations/customer-view";
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
        <ButtonLink href="/auth/login">{t("nav.signIn")}</ButtonLink>
        <ButtonLink href="/auth/sign-up" variant="outline">{t("footer.createAccount")}</ButtonLink>
      </EmptyState>
    );
  }
  return <>{children}</>;
}

export function AccountNav() {
  const t = useT();
  const pathname = useLocalePathname();
  const { session } = useSession();
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
            <LogoutButton variant="ghost" className="text-label !justify-start w-full font-normal text-ink-soft">{t("account.nav.signOut")}</LogoutButton>
          </li>
        )}
      </ul>
    </nav>
  );
}

/** A failed account call: an expired session says so and offers to sign in again (it is never retried as a guest); anything else gets a retry. */
function AccountError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  if (isSessionProblem(error)) {
    return (
      <Alert tone="warning" live="polite" title={t("apiErrors.session_expired")}>
        <Link href="/auth/login?next=%2Faccount" className="font-semibold underline underline-offset-2">{t("nav.signIn")}</Link>
      </Alert>
    );
  }
  return <ApiErrorState error={error} onRetry={onRetry} />;
}

const itemCount = (r: CustomerReservation) => r.lines.reduce((n, l) => n + l.quantity, 0);

function ReservationRow({ r }: { r: CustomerReservation }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <li>
      <Link href={`/reservations/${encodeURIComponent(r.reference)}?mine=${encodeURIComponent(r.id)}`} className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-sand-50">
        <div className="min-w-0 flex-1">
          <p className="text-label font-semibold" translate="no">{r.reference}</p>
          <p className="text-caption text-ink-soft">{fmt.date(r.createdAt, "short")} · {t("account.reservations.items", { count: itemCount(r) })}</p>
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
  const profile = useCustomerProfile();
  const recent = useMyReservations(0, 3);
  const name = profile.data?.firstName || session?.firstName || "";
  const failure = profile.error ?? recent.error;
  return (
    <RequireSession>
      <h1 className="text-h1">{t("account.overview.hello", { name })}</h1>
      <p className="text-body mt-1 text-ink-soft">{t("account.overview.intro")}</p>
      {failure != null && <div className="mt-5"><AccountError error={failure} onRetry={() => { profile.reload(); recent.reload(); }} /></div>}
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="text-h3">{t("account.overview.profileCard")}</h2>
          {profile.data ? (
            profile.data.firstName || profile.data.lastName ? (
              <p className="text-label mt-2 font-normal text-ink-soft">{profile.data.firstName} {profile.data.lastName}<br />{profile.data.email}<br />{[profile.data.dialCode, profile.data.phone].filter(Boolean).join(" ")}</p>
            ) : (
              <p className="text-label mt-2 font-normal text-ink-soft">{profile.data.email}<br />{t("account.profile.incomplete")}</p>
            )
          ) : <Skeleton className="mt-3 h-12 w-3/4" />}
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
        {recent.loading && !recent.items.length ? <Skeleton className="h-16 w-full" /> : recent.items.length === 0 ? <p className="text-label font-normal text-ink-soft">{t("account.reservations.empty")}</p> : <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{recent.items.map((r) => <ReservationRow key={r.id} r={r} />)}</ul>}
      </section>
    </RequireSession>
  );
}

const PAGE_SIZE = 10;

export function ReservationsView() {
  const t = useT();
  const [page, setPage] = useState(0);
  const mine = useMyReservations(page, PAGE_SIZE);
  return (
    <RequireSession>
      <h1 className="text-h1">{t("account.reservations.title")}</h1>
      {mine.error != null ? (
        <div className="mt-6"><AccountError error={mine.error} onRetry={mine.reload} /></div>
      ) : mine.loading && !mine.items.length ? (
        <div role="status" aria-label={t("common.loading")} className="mt-6"><Skeleton className="h-16 w-full" /></div>
      ) : mine.items.length === 0 && page === 0 ? (
        <EmptyState icon={<PackageOpen aria-hidden />} title={t("account.reservations.empty")} description={t("account.reservations.emptyText")}><ButtonLink href="/products">{t("cart.continueBrowsing")}</ButtonLink></EmptyState>
      ) : (
        <>
          <ul className="mt-6 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{mine.items.map((r) => <ReservationRow key={r.id} r={r} />)}</ul>
          {mine.totalPages > 1 && (
            <nav aria-label={t("catalog.pagination")} className="mt-4 flex items-center justify-between gap-3">
              <Button variant="outline" disabled={page === 0 || mine.loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t("catalog.previous")}</Button>
              <p className="text-label font-normal text-ink-soft">{t("catalog.page", { n: page + 1 })} / {mine.totalPages}</p>
              <Button variant="outline" disabled={page + 1 >= mine.totalPages || mine.loading} onClick={() => setPage((p) => p + 1)}>{t("catalog.next")}</Button>
            </nav>
          )}
        </>
      )}
    </RequireSession>
  );
}

export function ProfileView() {
  const t = useT();
  const profile = useCustomerProfile();
  return (
    <RequireSession>
      <h1 className="text-h1">{t("account.profile.title")}</h1>
      {profile.error != null ? <div className="mt-6"><AccountError error={profile.error} onRetry={profile.reload} /></div>
        : profile.data ? <ProfileForm initial={profile.data} />
        : <div role="status" aria-label={t("common.loading")} className="mt-6"><Skeleton className="h-64 max-w-xl" /></div>}
    </RequireSession>
  );
}

/** Mounted once the profile has loaded. Saving calls the API; the saved record it answers with is what is shown, nothing is "saved" locally. */
function ProfileForm({ initial }: { initial: { firstName: string | null; lastName: string | null; dialCode: string | null; phone: string | null; email: string | null } }) {
  const t = useT();
  const toast = useToast();
  const [draft, setDraft] = useState({ firstName: initial.firstName ?? "", lastName: initial.lastName ?? "", dialCode: initial.dialCode ?? dialCodes[0], phone: initial.phone ?? "" });
  const email = initial.email ?? "";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const next: Record<string, string> = {};
    if (isBlank(draft.firstName)) next.firstName = t("validation.firstName");
    if (isBlank(draft.lastName)) next.lastName = t("validation.lastName");
    if (!isValidPhone(draft.phone)) next.phone = t("validation.phone");
    setErrors(next);
    setFailure(undefined);
    if (Object.keys(next).length) { window.setTimeout(() => focusFirstInvalid(form)); return; }
    setSaving(true);
    try {
      const saved = await saveProfile({ firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), dialCode: draft.dialCode, phone: draft.phone.trim(), email: email || undefined });
      setDraft({ firstName: saved.firstName ?? "", lastName: saved.lastName ?? "", dialCode: saved.dialCode ?? draft.dialCode, phone: saved.phone ?? "" });
      toast.show({ tone: "success", message: t("account.profile.saved") });
    } catch (err) {
      const fields = fieldProblems(err);
      const mapped: Record<string, string> = {};
      if (fields.firstName) mapped.firstName = t("validation.firstName");
      if (fields.lastName) mapped.lastName = t("validation.lastName");
      if (fields.phone || fields.dialCode) mapped.phone = t("validation.phone");
      setErrors(mapped);
      setFailure(err);
    } finally {
      setSaving(false);
    }
  };
  const edit = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setDraft({ ...draft, [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: "" })); };
  return (
    <form method="post" onSubmit={submit} noValidate className="mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
      {failure != null && <div className="sm:col-span-2">{isSessionProblem(failure) ? <AccountError error={failure} onRetry={() => setFailure(undefined)} /> : <Alert tone="danger" live="assertive">{t(apiErrorKey(failure))}</Alert>}</div>}
      <TextField label={t("account.profile.firstName")} autoComplete="given-name" value={draft.firstName} onChange={edit("firstName")} error={errors.firstName} />
      <TextField label={t("account.profile.lastName")} autoComplete="family-name" value={draft.lastName} onChange={edit("lastName")} error={errors.lastName} />
      <TextField label={t("account.profile.email")} className="sm:col-span-2" type="email" value={email} readOnly hint={t("account.profile.emailHint")} />
      <div className="grid grid-cols-[7.5rem_1fr] gap-3 sm:col-span-2">
        <SelectField label={t("account.profile.dialCode")} value={draft.dialCode} onChange={edit("dialCode")}>{dialCodes.map((d) => <option key={d}>{d}</option>)}</SelectField>
        <TextField label={t("account.profile.phone")} type="tel" autoComplete="tel-national" value={draft.phone} onChange={edit("phone")} error={errors.phone} />
      </div>
      <div className="sm:col-span-2"><Button type="submit" size="lg" loading={saving}>{t("account.profile.save")}</Button></div>
    </form>
  );
}
