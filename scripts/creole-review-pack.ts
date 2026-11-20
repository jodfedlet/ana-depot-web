/**
 * Builds the file a native Haitian Creole reviewer works from: every string of the application and of the customer e-mails, with its French source side by side, a column for the
 * corrected Creole and a status column. Nothing here changes the application: approved corrections are applied by a developer afterwards (docs/creole-review.md).
 *
 *   npx tsx scripts/creole-review-pack.ts > docs/creole-review-pack.csv
 *
 * Columns: area, key, french, creole_current, creole_correction, status (reviewer: OK / CHANGE / QUESTION), reviewer_note
 */
import { readFileSync } from "node:fs";
import { fr } from "../src/i18n/messages/fr";
import { ht } from "../src/i18n/messages/ht";

type Tree = { [k: string]: string | Tree };
const rows: string[][] = [];

function walk(a: Tree, b: Tree, path: string[]) {
  for (const key of Object.keys(a)) {
    const av = a[key], bv = b?.[key];
    if (typeof av === "string") rows.push([path[0] ?? key, [...path, key].join("."), av, typeof bv === "string" ? bv : "", "", "", ""]);
    else walk(av, (bv ?? {}) as Tree, [...path, key]);
  }
}
walk(fr as unknown as Tree, ht as unknown as Tree, []);

// customer e-mails (Spring message bundles, UTF-8 .properties)
const props = (file: string) => Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const dir = "../ana-depot-api/src/main/resources/email";
const mfr = props(`${dir}/messages_fr.properties`), mht = props(`${dir}/messages_ht.properties`);
for (const key of Object.keys(mfr)) rows.push(["e-mail", `email:${key}`, mfr[key], mht[key] ?? "", "", "", ""]);

const csv = (cell: string) => `"${cell.replaceAll('"', '""')}"`;
console.log(["area", "key", "french", "creole_current", "creole_correction", "status", "reviewer_note"].join(","));
for (const r of rows) console.log(r.map(csv).join(","));
console.error(`${rows.length} strings (${rows.filter((r) => !r[3]).length} without a Creole text)`);
