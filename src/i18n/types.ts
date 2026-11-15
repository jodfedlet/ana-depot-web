import type { Locale } from "./config";
import type { fr } from "./messages/fr";

/** A message is a string, or a one/other pair selected by `vars.count`. */
export type Leaf = string | { one: string; other: string };

/** The French dictionary defines the shape. Every other language must satisfy it (compile-time completeness). */
export type Messages = typeof fr;

type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
export type Vars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: Vars) => string;

const interpolate = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`)) : text;

export function createT(messages: Messages, locale: Locale): TFunction {
  return (key, vars) => {
    let node: unknown = messages;
    for (const part of key.split(".")) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    if (typeof node === "string") return interpolate(node, vars);
    if (node && typeof node === "object" && "one" in node && "other" in node) {
      const count = Number(vars?.count ?? 0);
      const leaf = node as { one: string; other: string };
      // French treats 0 and 1 as singular; Haitian Creole has no grammatical plural.
      const singular = locale === "fr" ? count === 0 || count === 1 : count === 1;
      return interpolate(singular ? leaf.one : leaf.other, vars);
    }
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing message: ${key} (${locale})`);
    return key;
  };
}
