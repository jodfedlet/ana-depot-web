"use client";

import { User } from "lucide-react";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import { useSession } from "@/lib/auth/use-session";

export function AccountLink() {
  const t = useT();
  const { status } = useSession();
  // While Supabase has not confirmed the session ("loading") we show a neutral link rather than guessing.
  const signedIn = status === "signed_in";
  return (
    <Link href={signedIn ? "/account" : "/auth/login"} aria-busy={status === "loading" || undefined} className="text-label hidden min-h-11 items-center gap-2 rounded-full px-2.5 text-ink hover:bg-sand-100 sm:inline-flex lg:px-3">
      <User aria-hidden className="size-[1.4rem] lg:size-5" />
      <span className="sr-only lg:not-sr-only">{status === "loading" ? t("nav.account") : signedIn ? t("nav.account") : t("nav.signIn")}</span>
    </Link>
  );
}
