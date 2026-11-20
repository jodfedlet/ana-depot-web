import "server-only";
import type { Locale } from "./config";
import { fr } from "./messages/fr";
import { ht } from "./messages/ht";
import { type Messages, createT } from "./types";

const dictionaries: Record<Locale, Messages> = { fr, ht };

export const getMessages = (locale: Locale): Messages => dictionaries[locale];
/** Translator for Server Components. Client Components use `useT()`. */
export const getT = (locale: Locale) => createT(dictionaries[locale], locale);

/**
 * Dictionary for the storefront. Everything that belongs to the administration stays on the server: the `admin` namespace AND the other top-level admin groups
 * (`adminDash`, `adminRes`, `adminTeam`, `adminSecurity`, `adminRole`, `adminNotif`, ...). They used to be serialized into EVERY public page twice (about 180 KB of HTML, measured), which cost
 * server CPU per request, bytes for every visitor on a slow network, and showed the wording of staff screens to the public. Two small exceptions are kept because storefront
 * screens use them: `adminCommon` (shared error wording) and `adminTeam.join` (the "join the team" page a signed-in invitee opens). `adminTeam` is therefore reduced to `join`.
 */
const ADMIN_GROUPS = ["admin", "adminCat", "adminProd", "adminInv", "adminRes", "adminCust", "adminPay", "adminDash", "adminSecurity", "adminRole", "adminNotif"] as const;

export function getStorefrontMessages(locale: Locale) {
  const all: Record<string, unknown> = { ...dictionaries[locale] };
  for (const group of ADMIN_GROUPS) delete all[group];
  all.adminTeam = { join: dictionaries[locale].adminTeam.join };
  return all as StorefrontMessages;
}

export type StorefrontMessages = Omit<Messages, (typeof ADMIN_GROUPS)[number] | "adminTeam"> & { adminTeam: Pick<Messages["adminTeam"], "join"> };
