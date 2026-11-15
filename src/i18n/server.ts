import "server-only";
import type { Locale } from "./config";
import { fr } from "./messages/fr";
import { ht } from "./messages/ht";
import { type Messages, createT } from "./types";

const dictionaries: Record<Locale, Messages> = { fr, ht };

export const getMessages = (locale: Locale): Messages => dictionaries[locale];
/** Translator for Server Components. Client Components use `useT()`. */
export const getT = (locale: Locale) => createT(dictionaries[locale], locale);

/** Dictionary for the storefront: the (larger) admin namespace is left out of the client payload. */
export function getStorefrontMessages(locale: Locale) {
  const { admin: _admin, ...rest } = dictionaries[locale];
  void _admin;
  return rest;
}
