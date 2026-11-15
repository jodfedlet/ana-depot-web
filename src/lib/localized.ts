import type { Locale } from "@/i18n/config";

/** Text authored in both launch languages (admin-authored content and sample data). */
export interface LText {
  fr: string;
  ht: string;
}
export const L = (fr: string, ht: string): LText => ({ fr, ht });
export const emptyLText = (): LText => ({ fr: "", ht: "" });
export const pick = (text: LText, locale: Locale): string => text[locale] || text.fr || text.ht;
export const isEmptyLText = (t: LText) => !t.fr.trim() && !t.ht.trim();
