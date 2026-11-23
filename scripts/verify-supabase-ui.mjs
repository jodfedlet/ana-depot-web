#!/usr/bin/env node
/**
 * Compares the authentication components of this repository with the OFFICIAL Supabase UI Library source, fetched live from the registry:
 *   https://supabase.com/ui/r/password-based-auth-nextjs.json   https://supabase.com/ui/r/social-auth-nextjs.json   https://supabase.com/ui/r/safe-next-path.json
 * and the shadcn registry items those blocks depend on (button, card, input, label: https://ui.shadcn.com/r/styles/new-york-v4/<name>.json).
 *
 * Method: both sides are parsed with the TypeScript compiler and printed in one canonical form (quotes, semicolons, layout, comments removed), then compared TOKEN BY TOKEN
 * (longest common subsequence). Import declarations are excluded (paths necessarily differ) and reported on their own. Output: per file, the share of the official source that is
 * kept unchanged, and every deviation (tokens only in the official file "-", tokens only in ours "+"). It judges nothing: read the deviations.
 * Usage: node scripts/verify-supabase-ui.mjs [--markdown]      (needs network; exit 0 always, 2 when the registry cannot be fetched)
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const BLOCK = "registry/default/blocks/password-based-auth-nextjs/";
const SOCIAL = "registry/default/blocks/social-auth-nextjs/";
const MAP = [
  // [registry item, file inside the item, local file]
  ["password-based-auth-nextjs", BLOCK + "components/login-form.tsx", "src/components/auth-block/login-form.tsx"],
  ["password-based-auth-nextjs", BLOCK + "components/sign-up-form.tsx", "src/components/auth-block/sign-up-form.tsx"],
  ["password-based-auth-nextjs", BLOCK + "components/forgot-password-form.tsx", "src/components/auth-block/forgot-password-form.tsx"],
  ["password-based-auth-nextjs", BLOCK + "components/update-password-form.tsx", "src/components/auth-block/update-password-form.tsx"],
  ["password-based-auth-nextjs", BLOCK + "components/logout-button.tsx", "src/components/auth-block/logout-button.tsx"],
  ["password-based-auth-nextjs", BLOCK + "app/auth/sign-up-success/page.tsx", "src/components/auth-block/sign-up-success.tsx"],
  ["password-based-auth-nextjs", BLOCK + "app/auth/error/page.tsx", "src/app/[locale]/(store)/auth/error/page.tsx"],
  ["password-based-auth-nextjs", BLOCK + "app/auth/confirm/route.ts", "src/app/[locale]/auth/callback/route.ts"],
  ["social-auth-nextjs", SOCIAL + "components/login-form.tsx", "src/components/auth-block/social-login-form.tsx"],
  ["safe-next-path", "registry/default/blocks/safe-next-path/lib/safe-next-path.ts", "src/lib/safe-next-path.ts"],
  ["shadcn:button", "registry/new-york-v4/ui/button.tsx", "src/components/auth-block/ui/button.tsx"],
  ["shadcn:card", "registry/new-york-v4/ui/card.tsx", "src/components/auth-block/ui/card.tsx"],
  ["shadcn:input", "registry/new-york-v4/ui/input.tsx", "src/components/auth-block/ui/input.tsx"],
  ["shadcn:label", "registry/new-york-v4/ui/label.tsx", "src/components/auth-block/ui/label.tsx"],
];

const urlOf = (item) => (item.startsWith("shadcn:") ? `https://ui.shadcn.com/r/styles/new-york-v4/${item.slice(7)}.json` : `https://supabase.com/ui/r/${item}.json`);
const cache = new Map();
async function registryFile(item, file) {
  if (!cache.has(item)) {
    const res = await fetch(urlOf(item), { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`${urlOf(item)} -> HTTP ${res.status}`);
    cache.set(item, await res.json());
  }
  const f = cache.get(item).files.find((x) => x.path === file);
  if (!f) throw new Error(`${file} is not in ${urlOf(item)}`);
  return f.content;
}

/** Attributes whose string value is text shown to the visitor (so `placeholder="m@example.com"` and `placeholder={t("...")}` are the same slot). */
const TEXT_ATTRS = new Set(["placeholder", "aria-label", "title", "alt"]);
const looksLikeText = (v) => /[A-Za-z]{2}/.test(v) && /\s|@|\.\.\.|[A-Z]/.test(v);

/**
 * Canonical token list of a TS/TSX source: no imports, no comments, string literals by value, and every piece of VISIBLE TEXT collapsed into one `<TEXT>` token
 * (JSX text, a text-like string literal in JSX, a `t("...")` call that replaces it). So translating a sentence is ONE substitution, not one per word.
 */
function tokens(source, name) {
  const sf = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports = sf.statements.filter((s) => ts.isImportDeclaration(s)).map((s) => s.moduleSpecifier.text);
  const out = [];
  const inJsx = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p)) return true; return false; };
  const walk = (node) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isJsxText(node)) { if (node.getText().trim()) out.push("<TEXT>"); return; }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "getT"].includes(node.expression.text) && node.arguments.length) { out.push("<TEXT>"); return; }
    if (ts.isCallExpression(node) && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "getT") { out.push("<TEXT>"); return; }
    if (ts.isStringLiteral(node)) {
      // class names / CSS are never "visible text": compare them literally
      for (let p = node.parent; p; p = p.parent) {
        if (ts.isJsxAttribute(p) && p.name.getText() === "className") { out.push(JSON.stringify(node.text)); return; }
        if (ts.isCallExpression(p) && ["cn", "cva", "twMerge", "clsx"].includes(p.expression.getText())) { out.push(JSON.stringify(node.text)); return; }
        if (ts.isJsxElement(p) || ts.isFunctionDeclaration(p)) break;
      }
      const attr = ts.isJsxAttribute(node.parent) ? node.parent.name.getText() : (ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent) ? node.parent.parent.name.getText() : "");
      const visible = TEXT_ATTRS.has(attr) || (inJsx(node) && !ts.isJsxAttribute(node.parent) && looksLikeText(node.text) && !/^[a-z0-9-:/\[\]_ .%()#]+$/.test(node.text));
      out.push(visible && looksLikeText(node.text) ? "<TEXT>" : JSON.stringify(node.text));
      return;
    }
    if (node.getChildCount() === 0) { const t = node.getText(); if (t.trim()) out.push(t); return; }
    for (const child of node.getChildren()) walk(child);
  };
  for (const st of sf.statements) walk(st);
  return { tokens: out, imports };
}

/** LCS-based diff of two token lists: returns the ops [{t:"=", v}, {t:"-", v}, {t:"+", v}]. */
function diff(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: "=", v: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "-", v: a[i++] }); }
    else { ops.push({ t: "+", v: b[j++] }); }
  }
  while (i < n) ops.push({ t: "-", v: a[i++] });
  while (j < m) ops.push({ t: "+", v: b[j++] });
  return ops;
}

/** Group consecutive changes into hunks. */
function hunks(ops) {
  const out = [];
  let cur = null;
  for (const op of ops) {
    if (op.t === "=") { if (cur) { out.push(cur); cur = null; } continue; }
    cur ??= { minus: [], plus: [] };
    (op.t === "-" ? cur.minus : cur.plus).push(op.v);
  }
  if (cur) out.push(cur);
  return out;
}

const markdown = process.argv.includes("--markdown");
const lines = [];
const say = (s = "") => { lines.push(s); console.log(s); };
const summary = [];
for (const [item, file, local] of MAP) {
  let official;
  try { official = await registryFile(item, file); } catch (e) { console.error(`cannot fetch ${urlOf(item)}: ${e.message}`); process.exit(2); }
  const ours = fs.readFileSync(path.join(root, local), "utf8");
  const A = tokens(official, file), B = tokens(ours, local);
  const ops = diff(A.tokens, B.tokens);
  const kept = ops.filter((o) => o.t === "=").length;
  const removed = ops.filter((o) => o.t === "-").length, added = ops.filter((o) => o.t === "+").length;
  const pct = ((kept / A.tokens.length) * 100).toFixed(1);
  summary.push({ local, item, pct, removed, added, total: A.tokens.length });
  say(`\n### ${local}`);
  say(`official: ${urlOf(item)}  ->  ${file}`);
  say(`official tokens ${A.tokens.length}; kept unchanged ${kept} (${pct}%); removed ${removed}; added ${added}`);
  say(`imports: official [${A.imports.join(", ")}]`);
  say(`         ours     [${B.imports.join(", ")}]`);
  const hs = hunks(ops);
  if (!hs.length) say("body: IDENTICAL to the official source after normalization");
  for (const h of hs.slice(0, 60)) say(`  - ${h.minus.join(" ").slice(0, 110) || "(nothing)"}\n  + ${h.plus.join(" ").slice(0, 110) || "(nothing)"}`);
  if (hs.length > 60) say(`  ... ${hs.length - 60} more deviations`);
}
say("\n## Summary (share of the official source kept unchanged, imports excluded)");
for (const s of summary) say(`${s.pct.padStart(5)}%  -${String(s.removed).padStart(4)} +${String(s.added).padStart(4)}  ${s.local}`);
if (markdown) fs.writeFileSync(path.join(root, "docs/supabase-ui-source-comparison.md"), "# Source comparison with the official Supabase UI Library (generated)\n\nGenerated by `node scripts/verify-supabase-ui.mjs --markdown`. Do not edit by hand.\n\n```text\n" + lines.join("\n") + "\n```\n");
