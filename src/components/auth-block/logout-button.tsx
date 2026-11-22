"use client";

import { useState, type ComponentProps } from "react";
import { useLocaleRouter } from "@/i18n/navigation";
import { useSession } from "@/lib/auth/use-session";
import { Button } from "./ui/button";

/**
 * Official Supabase UI block `password-based-auth-nextjs`: components/logout-button.tsx (`supabase.auth.signOut()` then a redirect to the login page).
 * Deviation: the sign-out goes through the app's session store (`useSession().signOut`), which calls `supabase.auth.signOut` on the shared client and
 * updates the client-side session mirror, then redirects to the localized login page.
 */
export function LogoutButton({ children, onSignedOut, ...props }: ComponentProps<typeof Button> & { onSignedOut?: () => void }) {
  const router = useLocaleRouter();
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const ok = await signOut();
        if (!ok) { setBusy(false); return; }
        onSignedOut?.();
        router.push("/auth/login?status=signed_out");
        router.refresh();
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
