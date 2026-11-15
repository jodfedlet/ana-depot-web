"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/provider";
import { authStore } from "@/lib/auth/auth-store";

/** Who is using the administration. Display only: it comes from the server-side access check, never from the browser. */
export interface AdminIdentity {
  email: string;
  name: string;
}
const Ctx = createContext<AdminIdentity | null>(null);

export function AdminIdentityProvider({ identity, children }: { identity: AdminIdentity; children: ReactNode }) {
  return <Ctx value={identity}>{children}</Ctx>;
}

export function useAdminSession() {
  const identity = useContext(Ctx);
  const router = useRouter();
  const locale = useLocale();
  return {
    session: identity,
    /** Ends the Supabase session, then returns to the staff sign-in. */
    signOut: async () => {
      await authStore.signOut();
      router.push(`/${locale}/admin/sign-in?status=signed_out`);
      router.refresh();
    },
  };
}
