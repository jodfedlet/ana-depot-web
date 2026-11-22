"use client";

import { Loader2 } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { useLocaleRouter } from "@/i18n/navigation";
import { useSession } from "@/lib/auth/use-session";
import { Button } from "./ui/button";

/** Supabase UI "password-based-auth-nextjs" block: LogoutButton (shadcn Button), bound to the app's single shared session store (same client and cookie session as everything else). */
export function LogoutButton({ children, onSignedOut, ...props }: ComponentProps<typeof Button> & { onSignedOut?: () => void }) {
  const router = useLocaleRouter();
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
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
      {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
