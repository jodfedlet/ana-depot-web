"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./config";
import { type LText, pick } from "@/lib/localized";
import { type Messages, type TFunction, createT } from "./types";

interface I18nValue {
  locale: Locale;
  t: TFunction;
}
const I18nContext = createContext<I18nValue | null>(null);

/** Receives ONE language's dictionary from the server layout, so only that language ships to the browser. */
export type ClientMessages = Omit<Messages, "admin"> & { admin?: Messages["admin"] };

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: ClientMessages; children: ReactNode }) {
  // The admin namespace is only sent to the browser inside /admin.
  const value = useMemo(() => ({ locale, t: createT(messages as Messages, locale) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT/useLocale must be used inside <I18nProvider>");
  return ctx;
}
export const useT = () => useI18n().t;
export const useLocale = () => useI18n().locale;

/** Resolve admin-authored bilingual text in the current UI language. */
export function useLText() {
  const locale = useLocale();
  return (text: LText) => pick(text, locale);
}
