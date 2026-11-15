"use client";

import { market } from "@/config/market";
import { useMemo } from "react";
import type { Locale } from "./config";
import { useLocale } from "./provider";

const MONTHS: Record<Locale, { long: string[]; short: string[] }> = {
  fr: {
    long: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    short: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  },
  ht: {
    long: ["janvye", "fevriye", "mas", "avril", "me", "jen", "jiyè", "out", "septanm", "oktòb", "novanm", "desanm"],
    short: ["janv.", "fev.", "mas", "avr.", "me", "jen", "jiyè", "out", "sept.", "okt.", "nov.", "des."],
  },
};

/**
 * Date/time formatting is done from numeric parts + our own month names because the browser's
 * Intl data does not include Haitian Creole (it would silently fall back to English).
 */
export function formatDateParts(iso: string, locale: Locale, timeZone: string = market.timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const month = get("month") - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    long: `${get("day")} ${MONTHS[locale].long[month]} ${get("year")}`,
    short: `${get("day")} ${MONTHS[locale].short[month]} ${get("year")}`,
    time: `${pad(get("hour"))}:${pad(get("minute"))}`,
  };
}

export function formatDate(iso: string, locale: Locale, style: "long" | "short" = "long"): string {
  return formatDateParts(iso, locale)[style];
}
export function formatDateTime(iso: string, locale: Locale, style: "long" | "short" = "short"): string {
  const p = formatDateParts(iso, locale);
  return `${p[style]} · ${p.time}`;
}

/** Locale-aware date helpers for client components. */
export function useFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      date: (iso: string, style: "long" | "short" = "long") => formatDate(iso, locale, style),
      dateTime: (iso: string, style: "long" | "short" = "short") => formatDateTime(iso, locale, style),
    }),
    [locale],
  );
}
