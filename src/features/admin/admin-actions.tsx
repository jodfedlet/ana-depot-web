"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminSession } from "./admin-identity";

/** "Sign in with another account": ends the current Supabase session first, then goes to the staff sign-in. */
export function AdminSignOutButton({ label, variant }: { label: string; variant?: "primary" | "outline" }) {
  const { signOut } = useAdminSession();
  const [busy, setBusy] = useState(false);
  return <Button variant={variant} loading={busy} onClick={async () => { setBusy(true); await signOut(); }}>{label}</Button>;
}
