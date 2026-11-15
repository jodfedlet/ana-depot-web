"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminSession } from "./admin-identity";

/** "Sign in with another account": ends the current Supabase session first, then goes to the staff sign-in. */
export function AdminSignOutButton({ label }: { label: string }) {
  const { signOut } = useAdminSession();
  const [busy, setBusy] = useState(false);
  return <Button loading={busy} onClick={async () => { setBusy(true); await signOut(); }}>{label}</Button>;
}
