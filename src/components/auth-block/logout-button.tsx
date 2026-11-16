"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useLocaleRouter } from "@/i18n/navigation";
import { useSession } from "@/lib/auth/use-session";

/** Supabase UI block: LogoutButton, bound to the app's single shared session store (same client and cookie session as everything else). */
export function LogoutButton({ children, onSignedOut, ...props }: ComponentProps<typeof Button> & { onSignedOut?: () => void }) {
  const router = useLocaleRouter();
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      loading={busy}
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
