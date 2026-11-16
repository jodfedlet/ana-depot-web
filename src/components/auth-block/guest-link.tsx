import { Link } from "@/i18n/link";
import type { Locale } from "@/i18n/config";
import { getT } from "@/i18n/server";

/** "Continue as guest": a plain link rendered by the PAGE, outside the Supabase form area. Guests browse and reserve without an account. */
export function GuestLink({ locale }: { locale: Locale }) {
  const t = getT(locale);
  return (
    <p className="text-label mx-auto -mt-6 max-w-lg px-4 pb-12 text-center font-normal text-ink-soft">
      {t("auth.login.guestText")}{" "}
      <Link href="/products" className="font-semibold text-brand-700 underline underline-offset-4">{t("auth.login.guestLink")}</Link>
    </p>
  );
}
