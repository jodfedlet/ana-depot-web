import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { getVerifiedUser } from "@/lib/auth/supabase-server";

/**
 * SERVER-SIDE gate for the customer account area: the request must carry a valid Supabase session (verified with the
 * auth server, not just read from the cookie). Anyone else is sent to sign in and brought back afterwards.
 * Accounts are optional — browsing, the cart, guest reservations and tracking never come through here.
 */
export async function AccountGate({ locale, children }: { locale: Locale; children: ReactNode }) {
  const user = await getVerifiedUser();
  if (!user) redirect(`/${locale}/sign-in?next=${encodeURIComponent("/account")}`);
  return <>{children}</>;
}
