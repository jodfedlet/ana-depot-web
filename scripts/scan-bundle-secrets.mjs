#!/usr/bin/env node
/**
 * Scans the BUILT output (.next/static, which ships to every browser, and .next/server) for secret material. Run after `npm run build`:
 *   node scripts/scan-bundle-secrets.mjs [extra-literal-secret ...]      (extra literals, e.g. a local service key, are matched verbatim; never print them)
 * Exit 1 when anything is found. The library code legitimately contains the PREFIXES "sb_secret_" / "service_role" (key validators), so the patterns look for whole keys.
 */
import fs from "node:fs";
import path from "node:path";

const patterns = {
  "Supabase secret key": /sb_secret_[A-Za-z0-9_-]{20,}/,
  "JWT (service-role or any token)": /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{5,}/,
  "database URL": /postgres(ql)?:\/\/[^\s"'`]+@/,
  "JDBC URL": /jdbc:postgresql:/,
  "AWS/R2 access key id": /AKIA[0-9A-Z]{12,}/,
  "private key block": /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/,
  "secret env name": /(SUPABASE_SERVICE_ROLE|R2_SECRET_ACCESS_KEY|SPRING_DATASOURCE_PASSWORD)/,
};
const literals = process.argv.slice(2).filter(Boolean);

function* files(dir) {
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (/\.(js|mjs|css|html|json|txt|map|rsc|body|meta)$/.test(e.name)) yield p;
  }
}

const found = [];
let scanned = 0;
for (const root of [".next/static", ".next/server"]) {
  for (const file of files(root)) {
    scanned++;
    const text = fs.readFileSync(file, "utf8");
    for (const [name, re] of Object.entries(patterns)) if (re.test(text)) found.push(`${file}: ${name}`);
    for (const lit of literals) if (text.includes(lit)) found.push(`${file}: a supplied secret literal`);
  }
}
console.log(`scanned ${scanned} files`);
if (found.length) {
  console.error(found.join("\n"));
  process.exit(1);
}
console.log("no secret material found in the build output");
