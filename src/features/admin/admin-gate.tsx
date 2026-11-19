import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import type { Locale } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { ShieldAlert, ServerCrash, Settings2 } from "lucide-react";
import { AdminSignOutButton } from "./admin-actions";
import { AdminIdentityProvider } from "./admin-identity";
import { AdminShell } from "./admin-shell";
import { StaffMfa } from "./staff-mfa";
import { getAdminAccess } from "@/lib/auth/supabase-server";

const displayName = (email: string) => {
  const local = email.split("@")[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "Staff";
};

/**
 * SERVER-SIDE access control for the whole administration. Nothing inside `children` is rendered unless the request
 * carries a valid Supabase session AND the backend says that person is staff (deny by default). It runs behind
 * <Suspense> because it reads the request's cookies. Layouts do not re-run on client-side navigation, so every
 * admin API call must (and will) be authorized by the backend again; this gate decides what the first render shows.
 */
export async function AdminGate({ locale, children }: { locale: Locale; children: ReactNode }) {
  const access = await getAdminAccess();
  if (access.state === "unauthenticated") redirect(`/${locale}/auth/login?next=${encodeURIComponent("/admin")}`);
  if (access.state === "session_invalid") redirect(`/${locale}/auth/login?status=expired&next=${encodeURIComponent("/admin")}`);
  if (access.state === "allowed") {
    return (
      <AdminIdentityProvider identity={{ email: access.me.email, name: displayName(access.me.email), role: access.me.role, permissions: access.me.permissions, mfaRecovered: access.me.mfaRecovered }}>
        <AdminShell>{children}</AdminShell>
      </AdminIdentityProvider>
    );
  }

  const t = getT(locale);
  if (access.state === "mfa_required") {
    // an active team member whose session has not passed the second factor yet: nothing of the administration is rendered, only the verification step
    return (
      <div className="grid min-h-dvh place-items-center bg-sand-50 p-4">
        <main id="main" className="w-full max-w-lg space-y-4 rounded-card border border-line bg-surface p-6">
          <StaffMfa />
          <AdminSignOutButton label={t("admin.guard.forbiddenAction")} variant="outline" />
        </main>
      </div>
    );
  }
  const view =
    access.state === "forbidden"
      ? { icon: <ShieldAlert aria-hidden />, title: t("admin.guard.forbiddenTitle"), text: t("admin.guard.forbiddenText", { email: access.email }), action: <AdminSignOutButton label={t("admin.guard.forbiddenAction")} /> }
      : access.state === "backend_unreachable"
        ? { icon: <ServerCrash aria-hidden />, title: t("admin.guard.unreachableTitle"), text: t("admin.guard.unreachableText"), action: <ButtonLink href="/admin">{t("admin.guard.retry")}</ButtonLink> }
        : { icon: <Settings2 aria-hidden />, title: t("admin.guard.notConfiguredTitle"), text: t("admin.guard.notConfiguredText"), action: null }; // nothing to sign in to: authentication is not configured on this deployment
  return (
    <div className="grid min-h-dvh place-items-center bg-sand-50 p-4">
      <main id="main" className="w-full max-w-lg rounded-card border border-line bg-surface p-4">
        <EmptyState icon={view.icon} title={view.title} description={view.text}>
          {view.action}
          <ButtonLink href="/" variant="outline">{t("admin.guard.backToStore")}</ButtonLink>
        </EmptyState>
      </main>
    </div>
  );
}
