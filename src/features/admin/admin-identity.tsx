"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/provider";
import { authStore } from "@/lib/auth/auth-store";
import type { Permission } from "@/lib/auth/authorization";

/** Who is using the administration. Display only: it comes from the server-side access check, never from the browser. */
export interface AdminIdentity {
  email: string;
  name: string;
  /** OWNER | MANAGER | STAFF (D14), from the backend's staff table. */
  role: string | null;
  permissions: string[];
}
const Ctx = createContext<AdminIdentity | null>(null);

export function AdminIdentityProvider({ identity, children }: { identity: AdminIdentity; children: ReactNode }) {
  return <Ctx value={identity}>{children}</Ctx>;
}

export function useAdminSession() {
  const identity = useContext(Ctx);
  const router = useRouter();
  const locale = useLocale();
  const permissions = identity?.permissions ?? [];
  return {
    session: identity,
    role: identity?.role ?? null,
    permissions,
    /** What to SHOW. The backend refuses what a role may not do, whatever the screen offers. */
    can: (permission: Permission) => permissions.includes(permission),
    /** Ends the Supabase session, then returns to the sign-in page. */
    signOut: async () => {
      await authStore.signOut();
      router.push(`/${locale}/auth/login?status=signed_out`);
      router.refresh();
    },
  };
}
