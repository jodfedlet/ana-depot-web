/**
 * OAUTH / PKCE browser suite against a LOCAL Supabase stack (real GoTrue, real e-mails in Mailpit). No Spring API needed (the app's `/api/v1/me*` calls go to the stub).
 * It is NOT a test of Google and NOT of a hosted project. What it proves, with no mocked endpoint:
 *   - the official social block's button shows (fr and ht) only when the build lists the provider, next to the unchanged e-mail form;
 *   - clicking it stores the PKCE verifier cookie and sends the browser to Supabase's `/auth/v1/authorize` with provider=google, a S256 code challenge and the exact locale
 *     callback as `redirect_to` (and the safe `next`);
 *   - the callback route's `?code=` branch: a REAL PKCE code issued by GoTrue (through a magic link, which returns to the app with exactly the same `?code=` an OAuth provider
 *     round trip does) is exchanged with `exchangeCodeForSession` using the verifier cookie, session cookies are written, `next` is honoured, open redirects are not;
 *   - a used/invalid code and a cancelled/failed provider round trip end on /auth/error?reason=oauth with the Google wording, and never create a session.
 * The Google consent screen and Google -> Supabase hand-back cannot be tested here (they need a Google OAuth client and an enabled provider).
 *
 * Build the app WITH the provider listed and start it (origin must be http://127.0.0.1:3100, the one in dev/supabase/config.toml):
 *   NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key> NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8086 npm run build
 *   npx next start -p 3100 -H 127.0.0.1      and      node e2e/real-supabase/stub-api.mjs
 * Required environment (all local, explicit): WEB_URL, SUPABASE_URL, SUPABASE_PUBLIC_KEY, MAIL_URL. Usage: npm run e2e:oauth
 */
import fs from "node:fs";
import os from "node:os";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright-core";

import { assertLocalUrls, assertLocalWeb } from "../../scripts/e2e-target-guard.mjs";
assertLocalWeb();
assertLocalUrls(process.env, ["SUPABASE_URL", "MAIL_URL"]);
const WEB = process.env.WEB_URL, SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_PUBLIC_KEY, MAIL = process.env.MAIL_URL;
if (!KEY) { console.error("Set SUPABASE_PUBLIC_KEY (the local publishable key)."); process.exit(2); }

const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${String(extra).replace(/\s+/g, " ").slice(0, 190)}]` : ""}`); };
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script error`, false, e.message.split("\n")[0]); } };
const pw = os.homedir() + "/.cache/ms-playwright";
const exe = process.env.CHROMIUM_PATH ?? `${pw}/${fs.readdirSync(pw).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now();
const newPage = async (viewport = { width: 390, height: 844 }) => { const ctx = await browser.newContext({ viewport }); return { ctx, page: await ctx.newPage() }; };
const body = (page) => page.locator("body").innerText();
const hydrated = async (page) => { if (!(await page.locator("main form input, main form button").count())) return; await page.waitForFunction(() => Object.keys(document.querySelector("main form button, main form input")).some((k) => k.startsWith("__reactProps")), null, { timeout: 8000 }).catch(() => {}); };
const settle = async (page) => { await page.waitForLoadState("networkidle").catch(() => {}); await hydrated(page); await sleep(250); };
const authCookies = async (ctx) => (await ctx.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
const verifierCookies = async (ctx) => (await ctx.cookies()).filter((c) => /code-verifier/.test(c.name));

// ---- Mailpit ---------------------------------------------------------------------------------------------------------------------------------
async function mailsFor(to) { const l = await (await fetch(`${MAIL}/api/v1/messages?limit=200`)).json(); return (l.messages ?? []).filter((m) => (m.To ?? []).some((t) => t.Address === to)).sort((a, b) => new Date(a.Created) - new Date(b.Created)); }
async function waitMails(to, count, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { const m = await mailsFor(to); if (m.length >= count) return m; await sleep(400); } return mailsFor(to); }
const fullMail = async (m) => (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
const hrefs = (full) => [...(full.HTML ?? "").matchAll(/href="([^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));

// ---- a Node-side @supabase/ssr client with an in-memory cookie jar (the PKCE verifier it stores is what a browser would hold) ------------------------
function jarClient() {
  const jar = new Map();
  const client = createServerClient(SB, KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (all) => all.forEach((c) => (c.value ? jar.set(c.name, c.value) : jar.delete(c.name))) }, cookieOptions: { sameSite: "lax", path: "/", secure: false } });
  return { client, jar };
}
async function confirmedUser(tag) {
  const email = `oauth-flow-${stamp}-${tag}@example.com`, password = "Correct-horse-1";
  const { client } = jarClient();
  const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${WEB}/fr/auth/callback?next=%2Faccount` } });
  if (error) throw new Error("sign-up failed: " + error.message);
  const [m] = await waitMails(email, 1);
  const link = hrefs(await fullMail(m)).find((h) => /token_hash/.test(h));
  const { ctx, page } = await newPage();
  await page.goto(link); await settle(page);
  await ctx.close();
  return { email, password };
}
/** A magic link for an existing user: GoTrue answers it with a PKCE `?code=` on the callback, the same shape an OAuth provider round trip returns. */
async function magicLink(email, next, nth) {
  const { client, jar } = jarClient();
  await sleep(1200);
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${WEB}/fr/auth/callback?next=${encodeURIComponent(next)}` } });
  if (error) throw new Error("signInWithOtp failed: " + error.message);
  const mails = await waitMails(email, nth);
  const link = hrefs(await fullMail(mails.at(-1))).find((h) => /\/auth\/v1\/verify/.test(h));
  return { link, cookies: [...jar].map(([name, value]) => ({ name, value, url: WEB, sameSite: "Lax" })) };
}

// ===================== A. the official social block's button, fr and ht ======================
await run("button visibility", async () => {
  for (const [loc, label] of [["fr", /Continuer avec Google/], ["ht", /Kontinye ak Google/]]) for (const path of ["/auth/login", "/auth/sign-up"]) {
    const { ctx, page } = await newPage();
    await page.goto(`${WEB}/${loc}${path}`); await settle(page);
    const slots = await page.$$eval("main [data-slot]", (els) => els.map((e) => e.getAttribute("data-slot")));
    check(`${loc} ${path}: the Google button (official social block card) shows, and the e-mail/password form is still there`, (await page.getByRole("button", { name: label }).isVisible()) && (await page.locator('main input[type="password"]').count()) >= 1 && slots.filter((s) => s === "card").length === 2);
    await ctx.close();
  }
});

// ===================== B. initiating Google: verifier cookie + exact hand-off to Supabase ======================
await run("initiate", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${WEB}/fr/auth/login?next=%2Freservations`); await settle(page);
  const sees = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize"), { timeout: 15000 });
  const answer = page.waitForResponse((r) => r.url().includes("/auth/v1/authorize"), { timeout: 15000 }).catch(() => null);
  await page.getByRole("button", { name: /Continuer avec Google/ }).click();
  const req = await sees; const u = new URL(req.url());
  check("click navigates to Supabase's authorize endpoint with provider=google", u.origin === new URL(SB).origin && u.searchParams.get("provider") === "google", req.url().replace(/code_challenge=[^&]+/, "code_challenge=…"));
  check("PKCE: an S256 code challenge is sent", !!u.searchParams.get("code_challenge") && u.searchParams.get("code_challenge_method") === "s256");
  check("redirect_to is this app's locale callback and keeps the safe ?next=", u.searchParams.get("redirect_to") === `${WEB}/fr/auth/callback?next=%2Freservations`, u.searchParams.get("redirect_to"));
  const vc = await verifierCookies(ctx);
  check("the PKCE code-verifier cookie is persisted (the main `...-code-verifier` plus the library's per-flow entries; all SameSite=Lax, Path=/)", vc.some((c) => /^sb-[^-]+-auth-token-code-verifier$/.test(c.name)) && vc.every((c) => c.sameSite === "Lax" && c.path === "/"), vc.map((c) => c.name.replace(/[0-9a-f]{32}/, "<hash>")).join(", "));
  const res = await answer;
  check("anonymous visitor can initiate it (no session needed, nothing signed in)", (await authCookies(ctx)).length === 0);
  console.log(`INFO  Supabase's answer for provider=google on this local project: HTTP ${res?.status() ?? "none"} (400 = provider not enabled here; with Google enabled and configured it is a redirect to accounts.google.com)`);
  await ctx.close();
  const evil = await newPage();
  await evil.page.goto(`${WEB}/fr/auth/login?next=%2F%2Fevil.example`); await settle(evil.page);
  const sees2 = evil.page.waitForRequest((r) => r.url().includes("/auth/v1/authorize"), { timeout: 15000 });
  await evil.page.getByRole("button", { name: /Continuer avec Google/ }).click();
  const u2 = new URL((await sees2).url());
  check("an open-redirect ?next=//evil.example is replaced by /account in redirect_to", u2.searchParams.get("redirect_to") === `${WEB}/fr/auth/callback?next=%2Faccount`, u2.searchParams.get("redirect_to"));
  await evil.ctx.close();
});

// ===================== C. the callback's ?code= branch with a REAL PKCE code ======================
let user;
await run("callback code exchange", async () => {
  user = await confirmedUser("c");
  const m1 = await magicLink(user.email, "/reservations", 2);
  const { ctx, page } = await newPage();
  await ctx.addCookies(m1.cookies);
  const before = (await verifierCookies(ctx)).map((c) => c.name);
  check("the verifier cookie(s) of the requesting client are present in the browser (as after signInWithOAuth)", before.some((n) => /^sb-[^-]+-auth-token-code-verifier$/.test(n)), before.map((n) => n.replace(/[0-9a-f]{32}/, "<hash>")).join(", "));
  await page.goto(m1.link); await settle(page);
  const final = new URL(page.url());
  check("GoTrue's PKCE code is exchanged by the callback (exchangeCodeForSession) and the visitor lands on the intended `next`", final.pathname === "/fr/reservations" && final.origin === new URL(WEB).origin, page.url());
  const cs = await authCookies(ctx);
  const session = cs.length ? JSON.parse(Buffer.from(cs.map((c) => c.value).join("").replace(/^base64-/, ""), "base64url").toString()) : null;
  check("session cookies were written (@supabase/ssr cookie, SameSite=Lax, Path=/) for this user", !!session?.access_token && cs.every((c) => c.sameSite === "Lax" && c.path === "/") && JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()).email === user.email);
  const left = (await verifierCookies(ctx)).map((c) => c.name);
  check("the main verifier cookie is consumed by the exchange", !left.some((n) => /^sb-[^-]+-auth-token-code-verifier$/.test(n)), `left: ${left.map((n) => n.replace(/[0-9a-f]{32}/, "<hash>")).join(", ") || "none"}`);
  await page.goto(`${WEB}/fr/account`); await settle(page);
  check("the session persists across navigation (protected /fr/account opens)", /\/fr\/account\/?$/.test(new URL(page.url()).pathname), page.url());
  await ctx.close();
  // the same link again: the code was consumed
  const again = await newPage();
  await again.ctx.addCookies(m1.cookies);
  await again.page.goto(m1.link); await settle(again.page);
  check("reusing the link/code -> /auth/error?reason=oauth, no session", /\/fr\/auth\/error\?reason=oauth/.test(again.page.url()) && (await authCookies(again.ctx)).length === 0, again.page.url());
  await again.ctx.close();
  // open redirect through `next`
  const m2 = await magicLink(user.email, "//evil.example/steal", 3);
  const ev = await newPage();
  await ev.ctx.addCookies(m2.cookies);
  await ev.page.goto(m2.link); await settle(ev.page);
  const evUrl = new URL(ev.page.url());
  check("a code callback with next=//evil.example stays on this site and falls back to /account", evUrl.origin === new URL(WEB).origin && evUrl.pathname === "/fr/account", ev.page.url());
  await ev.ctx.close();
});

// ===================== D. cancelled / failed / invalid callbacks, in both languages ======================
await run("failure callbacks", async () => {
  const cases = [
    ["cancelled by the visitor at Google", "?error=access_denied&error_code=access_denied&error_description=The+user+denied+access"],
    ["provider/Supabase error", "?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code"],
    ["invalid code", "?code=not-a-real-code"],
    ["code without a verifier cookie", "?code=00000000-0000-0000-0000-000000000000"],
  ];
  for (const [loc, title] of [["fr", "Connexion avec Google impossible"], ["ht", "Koneksyon ak Google pa mache"]]) for (const [name, q] of cases) {
    const { ctx, page } = await newPage();
    await page.goto(`${WEB}/${loc}/auth/callback${q}&next=%2Fadmin`); await settle(page);
    const t = await body(page);
    check(`${loc}: ${name} -> /auth/error?reason=oauth with the Google wording, no session, nothing about links`, new RegExp(`/${loc}/auth/error\\?reason=oauth`).test(page.url()) && t.includes(title) && (await authCookies(ctx)).length === 0 && !/lien|lyen/i.test(t.replace(/Retour à la boutique|Tounen nan magazen an/g, "")), page.url());
    await ctx.close();
  }
  const { ctx, page } = await newPage();
  await page.goto(`${WEB}/fr/auth/callback?token_hash=bad&type=signup`); await settle(page);
  check("an e-mail link failure keeps its own wording (reason=verify, unchanged)", /reason=verify/.test(page.url()) && (await body(page)).includes("Ce lien ne fonctionne pas"), page.url());
  await page.goto(`${WEB}/fr/auth/callback?code=bad&next=%2Fauth%2Fupdate-password`); await settle(page);
  check("a recovery failure keeps its own wording (reason=reset, unchanged)", /reason=reset/.test(page.url()), page.url());
  await ctx.close();
});

await browser.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
