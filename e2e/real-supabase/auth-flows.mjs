/**
 * AUTH-FLOW browser suite against a LOCAL Supabase stack (real GoTrue, real e-mails read from Mailpit). It needs NO Spring API: the app's `GET /api/v1/me` is
 * answered by a tiny stub (see "Stub API" below), so it proves the screens, the Supabase calls, the e-mail links, the callback route and the session cookies,
 * and says NOTHING about the backend (JWT validation, customer profile). That is `npm run e2e:real`'s job. It is NOT a test of a hosted Supabase project.
 *
 * Build and start the app against the local stack (the origin must be the one in dev/supabase/config.toml: http://127.0.0.1:3100):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key> NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8086 npm run build
 *   npx next start -p 3100 -H 127.0.0.1
 * Stub API on :8086 (answers /api/v1/me* with the token's claims): `node e2e/real-supabase/stub-api.mjs`.
 * Required environment (all local, explicit): WEB_URL, SUPABASE_URL, SUPABASE_PUBLIC_KEY, MAIL_URL (Mailpit). It creates throwaway users named auth-flow-<timestamp>-*@example.com.
 * Usage: node e2e/real-supabase/auth-flows.mjs   (or: npm run e2e:auth-flows)
 */
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";

import { assertLocalUrls, assertLocalWeb } from "../../scripts/e2e-target-guard.mjs";
assertLocalWeb();
assertLocalUrls(process.env, ["SUPABASE_URL", "MAIL_URL"]);
const WEB = process.env.WEB_URL;
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLIC_KEY;
const MAIL = process.env.MAIL_URL;
if (!KEY) { console.error("Set SUPABASE_PUBLIC_KEY (the local publishable key)."); process.exit(2); }

const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${String(extra).replace(/\s+/g, " ").slice(0, 170)}]` : ""}`); };
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script error`, false, e.message.split("\n")[0]); } };
const base = `${os.homedir()}/.cache/ms-playwright`;
const exe = process.env.CHROMIUM_PATH ?? `${base}/${fs.readdirSync(base).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now();
const email = (tag) => `auth-flow-${stamp}-${tag}@example.com`;
const PW = "Correct-horse-1";

async function newPage(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  return { ctx, page };
}
const body = (page) => page.locator("body").innerText();
// React attaches `__reactProps$…` to a DOM node when it hydrates it; text typed before that is thrown away by the controlled input, so wait for it.
async function hydrated(page) {
  if (!(await page.locator("main form input").count())) return;
  await page.waitForFunction(() => Object.keys(document.querySelector("main form input")).some((k) => k.startsWith("__reactProps")), null, { timeout: 8000 }).catch(() => {});
}
const settle = async (page) => { await page.waitForLoadState("networkidle").catch(() => {}); await hydrated(page); await sleep(250); };
// the e-mail/password form is the first form on the page (a Google-enabled build adds the social block's form after it)
const submit = (page) => page.locator("main form button[type=submit]").first().click();
const EXPECT_OAUTH = process.env.EXPECT_OAUTH === "1"; // set when the app was built with NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google
const fillAuth = async (page, { mail, pw, repeat }) => {
  if (mail !== undefined) await page.locator("input[type=email]").fill(mail);
  const pws = page.locator("input[type=password]");
  if (pw !== undefined) await pws.nth(0).fill(pw);
  if (repeat !== undefined) await pws.nth(1).fill(repeat);
};

// ---- Mailpit -------------------------------------------------------------------------------------------------------------------------------
async function mailsFor(to) {
  const list = await (await fetch(`${MAIL}/api/v1/messages?limit=200`)).json();
  return (list.messages ?? []).filter((m) => (m.To ?? []).some((t) => t.Address === to)).sort((a, b) => new Date(a.Created) - new Date(b.Created));
}
async function waitMails(to, count, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const m = await mailsFor(to); if (m.length >= count) return m; await sleep(400); }
  return mailsFor(to);
}
const fullMail = async (m) => (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
const linkOf = (full) => (/href="([^"]*(?:token_hash|auth\/callback)[^"]*)"/.exec(full.HTML ?? "") ?? [])[1]?.replaceAll("&amp;", "&");

// ---- session cookie helpers (the @supabase/ssr cookie: `base64-` + base64url(JSON), possibly chunked) ------------------------------------------
const authCookies = async (ctx) => (await ctx.cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
async function readSession(ctx) {
  const cs = await authCookies(ctx);
  if (!cs.length) return null;
  const raw = cs.map((c) => c.value).join("");
  return JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
}
async function writeSession(ctx, session) {
  const cs = await authCookies(ctx);
  const baseName = cs[0].name.replace(/\.\d+$/, "");
  const tmpl = { domain: cs[0].domain, path: cs[0].path, httpOnly: cs[0].httpOnly, secure: cs[0].secure, sameSite: cs[0].sameSite };
  await ctx.clearCookies({ name: new RegExp(`^${baseName.replace(/[-.]/g, "\\$&")}(\\.\\d+)?$`) });
  await ctx.addCookies([{ ...tmpl, name: baseName, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") }]);
}

const T = {
  fr: { mismatch: "Les mots de passe ne correspondent pas.", weak: "Ce mot de passe est trop faible", bad: "L'e-mail ou le mot de passe est incorrect.", unverified: "pas encore vérifiée", resent: "il vient d'être renvoyé", success: "Vérifiez votre e-mail", sent: "Consultez vos e-mails", expired: "Ce lien est invalide ou a expiré", errorTitle: "Ce lien ne fonctionne pas", signedOut: "Vous êtes déconnecté.", signOut: /Se déconnecter/ },
  ht: { success: "Verifye imèl ou" },
};

// ===================== A. sign-up, e-mail verification, resend, duplicate (French) ======================
const A = email("a");
let confirmLink;
await run("sign-up (fr)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${WEB}/fr/auth/sign-up`); await settle(page);
  const t0 = await body(page);
  check(`sign-up page renders the official block's three fields (e-mail, password, repeat password) and ${EXPECT_OAUTH ? "the Google card" : "no OAuth button by default"}`, (await page.locator("main form input").count()) === 3 && /google/i.test(t0) === EXPECT_OAUTH);
  await fillAuth(page, { mail: A, pw: PW, repeat: PW + "x" }); await submit(page);
  await page.getByText(T.fr.mismatch).waitFor({ timeout: 8000 }); check("mismatched passwords -> translated message (the block's own check), nothing sent to Supabase", (await mailsFor(A)).length === 0);
  await fillAuth(page, { pw: "123", repeat: "123" }); await submit(page);
  await page.getByText(T.fr.weak).waitFor({ timeout: 10000 }); check("weak password -> Supabase's weak_password code shown as a translated message", true);
  await fillAuth(page, { pw: PW, repeat: PW }); await submit(page);
  await page.waitForURL(/\/fr\/auth\/sign-up-success/, { timeout: 15000 }); check("valid sign-up lands on the block's sign-up-success page", (await body(page)).includes(T.fr.success));
  const mails = await waitMails(A, 1);
  check("Supabase sent the confirmation e-mail (real GoTrue + Mailpit)", mails.length === 1, mails[0]?.Subject);
  const full = await fullMail(mails[0]);
  confirmLink = linkOf(full);
  check("the e-mail is in French (template picks the language from the sign-up locale metadata)", /Confirmez votre adresse/.test(full.HTML ?? full.Text ?? ""));
  check("the link goes to this app's /fr/auth/callback with a token hash and a safe ?next=", /\/fr\/auth\/callback\?next=%2Faccount&token_hash=.+&type=signup/.test(confirmLink ?? ""), confirmLink?.replace(/token_hash=[^&]+/, "token_hash=…"));
  await ctx.close();
});

await run("sign-in before verification + resend (fr)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${WEB}/fr/auth/login`); await settle(page);
  await fillAuth(page, { mail: A, pw: PW }); await submit(page);
  await page.getByText(T.fr.unverified).waitFor({ timeout: 10000 });
  check("unverified address -> translated 'not verified yet' message and a resend action", await page.getByRole("button", { name: /Renvoyer/ }).isVisible());
  await sleep(1200);
  await page.getByRole("button", { name: /Renvoyer/ }).click();
  await page.getByText(T.fr.resent).waitFor({ timeout: 10000 });
  const mails = await waitMails(A, 2);
  check("resend delivered a second confirmation e-mail", mails.length === 2, `${mails.length} e-mails`);
  if (mails.length === 2) confirmLink = linkOf(await fullMail(mails[1]));
  await ctx.close();
});

await run("verification link, sign-in state, sign-out, protected page (fr)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(confirmLink); await settle(page);
  check("the confirmation link verifies the address and opens the account page", /\/fr\/account\/?$/.test(new URL(page.url()).pathname), page.url());
  check("Supabase stored the session in the @supabase/ssr cookie (not localStorage)", !!(await readSession(ctx))?.access_token && !(await page.evaluate(() => Object.keys(localStorage).some((k) => /^sb-/.test(k)))));
  const session = await readSession(ctx);
  const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString());
  check("the access token is the user's real Supabase token (email claim matches)", claims.email === A);
  await page.goto(`${WEB}/fr/account/profile`); await settle(page);
  const calls = await (await fetch("http://127.0.0.1:8086/__calls")).json().catch(() => null);
  check("the profile page called the backend (stub) with this user's real token: the bearer token reaches the API (the real backend validates it, not tested here)", Array.isArray(calls) && calls.some((c) => c.path === "/api/v1/me/profile" && c.sub === claims.sub), calls ? `${calls.length} authenticated calls` : "stub not reachable");
  const fields = await page.locator("input").evaluateAll((els) => els.map((e) => e.value));
  check("the profile page shows the Supabase account e-mail", (await body(page)).includes(A) || fields.includes(A), `${fields.length} fields`);
  await page.goto(`${WEB}/fr/account`); await settle(page);
  // sign out
  await page.getByRole("button", { name: T.fr.signOut }).first().click();
  await page.waitForURL(/\/fr\/auth\/login\?status=signed_out/, { timeout: 15000 }); await settle(page);
  await page.getByText(T.fr.signedOut).waitFor({ timeout: 8000 }).catch(() => {});
  check("sign-out ends the Supabase session and redirects to the login page with a 'signed out' message", (await body(page)).includes(T.fr.signedOut) && (await authCookies(ctx)).length === 0, `cookies left: ${(await authCookies(ctx)).length}`);
  await page.goto(`${WEB}/fr/account`); await settle(page);
  check("after sign-out the account page asks for authentication again (protected)", /\/fr\/auth\/login/.test(page.url()) && /next=/.test(page.url()), page.url());
  await ctx.close();
  // the same link cannot be reused
  const second = await newPage();
  await second.page.goto(confirmLink); await settle(second.page);
  check("reusing an already-used confirmation link -> /auth/error (never a session)", /\/fr\/auth\/error\?reason=verify/.test(second.page.url()) && (await body(second.page)).includes(T.fr.errorTitle) && (await authCookies(second.ctx)).length === 0, second.page.url());
  await second.ctx.close();
});

await run("sign-in errors, intended destination, session refresh (fr)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${WEB}/fr/auth/login`); await settle(page);
  await fillAuth(page, { mail: A, pw: "wrong-password-1" }); await submit(page);
  await page.getByText(T.fr.bad).waitFor({ timeout: 10000 }); check("wrong password -> translated invalid-credentials message, no session", (await authCookies(ctx)).length === 0);
  await page.goto(`${WEB}/fr/account`); await settle(page);
  const toLogin = page.url();
  check("a protected page sends visitors to the login with ?next= (the intended destination)", /\/fr\/auth\/login\?.*next=/.test(toLogin), toLogin);
  await fillAuth(page, { mail: A, pw: PW }); await submit(page);
  await page.waitForURL(/\/fr\/account\/?$/, { timeout: 15000 }); check("sign-in returns to the intended page", true);
  // session refresh: pretend the access token is past its expiry; the refresh token must renew it
  const before = await readSession(ctx);
  await writeSession(ctx, { ...before, expires_at: Math.floor(Date.now() / 1000) - 60 });
  await page.goto(`${WEB}/fr/account`); await settle(page);
  const after = await readSession(ctx);
  check("an expired access token is refreshed with the refresh token (page still opens, cookie rotated)", /\/fr\/account\/?$/.test(new URL(page.url()).pathname) && after?.access_token && after.refresh_token !== before.refresh_token, `${page.url()}`);
  // expired session: no usable refresh token
  await writeSession(ctx, { ...after, expires_at: Math.floor(Date.now() / 1000) - 60, refresh_token: "not-a-valid-refresh-token" });
  await page.goto(`${WEB}/fr/account`); await settle(page);
  const final = page.url();
  check("a session that cannot be refreshed is treated as signed out (account page asks to sign in again)", /\/fr\/auth\/login/.test(final), final);
  await ctx.close();
});

await run("duplicate registration (fr)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${WEB}/fr/auth/sign-up`); await settle(page);
  await fillAuth(page, { mail: A, pw: PW, repeat: PW }); await submit(page);
  await page.waitForURL(/\/fr\/auth\/sign-up-success/, { timeout: 15000 });
  const t = await body(page);
  check("an already-registered, confirmed address ends on the SAME success screen as a new one (no account-existence disclosure)", t.includes(T.fr.success) && !/déjà utilisé|already/i.test(t));
  await ctx.close();
});

// ===================== B. password recovery ======================
await run("forgot password and reset (fr)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${WEB}/fr/auth/forgot-password`); await settle(page);
  await sleep(1200);
  await fillAuth(page, { mail: A }); await submit(page);
  await page.getByText(T.fr.sent).waitFor({ timeout: 10000 });
  check("recovery request -> neutral confirmation", true);
  const mails = (await waitMails(A, 3)).filter((m) => /Mot de passe|Modpas/.test(m.Subject ?? ""));
  check("Supabase sent the recovery e-mail", mails.length >= 1, mails.at(-1)?.Subject);
  const link = linkOf(await fullMail(mails.at(-1)));
  check("the recovery link goes through /fr/auth/callback with next=/auth/update-password", /\/fr\/auth\/callback\?next=%2Fauth%2Fupdate-password&token_hash=.+&type=recovery/.test(link ?? ""), link?.replace(/token_hash=[^&]+/, "token_hash=…"));
  await page.goto(link); await settle(page);
  check("the recovery link opens the update-password page with a recovery session", /\/fr\/auth\/update-password/.test(page.url()) && (await authCookies(ctx)).length > 0, page.url());
  await page.locator("input[type=password]").fill("New-Passw0rd-2"); await submit(page);
  await page.waitForURL(/\/fr\/account\/?$/, { timeout: 15000 }); check("password updated -> signed in and sent to the account page", true);
  await ctx.close();
  const fresh = await newPage();
  await fresh.page.goto(link); await settle(fresh.page);
  check("reusing the recovery link -> /auth/error?reason=reset", /\/fr\/auth\/error\?reason=reset/.test(fresh.page.url()), fresh.page.url());
  await fresh.page.goto(`${WEB}/fr/auth/login`); await settle(fresh.page);
  await fillAuth(fresh.page, { mail: A, pw: PW }); await submit(fresh.page);
  await fresh.page.getByText(T.fr.bad).waitFor({ timeout: 10000 }); check("the OLD password no longer works", true);
  await fillAuth(fresh.page, { pw: "New-Passw0rd-2" }); await submit(fresh.page);
  await fresh.page.waitForURL(/\/fr\/account\/?$/, { timeout: 15000 }); check("the NEW password works", true);
  await fresh.ctx.close();
  const nosess = await newPage();
  await nosess.page.goto(`${WEB}/fr/auth/update-password`); await settle(nosess.page);
  await nosess.page.locator("input[type=password]").fill("Another-Passw0rd-3"); await submit(nosess.page);
  await nosess.page.getByText(T.fr.expired).waitFor({ timeout: 10000 }); check("update-password without a recovery session -> 'link invalid or expired', nothing changed", true);
  await nosess.ctx.close();
});

// ===================== C. Haitian Creole ======================
await run("sign-up and verification (ht)", async () => {
  const H = email("h");
  const { ctx, page } = await newPage();
  await page.goto(`${WEB}/ht/auth/sign-up`); await settle(page);
  await fillAuth(page, { mail: H, pw: PW, repeat: PW }); await submit(page);
  await page.waitForURL(/\/ht\/auth\/sign-up-success/, { timeout: 15000 });
  check("sign-up success page is in Haitian Creole", (await body(page)).includes(T.ht.success));
  const mails = await waitMails(H, 1);
  const full = await fullMail(mails[0]);
  check("the confirmation e-mail is in Haitian Creole", /Konfime adrès imèl ou/.test(full.HTML ?? ""));
  await page.goto(linkOf(full)); await settle(page);
  check("the link opens the Creole account page", /\/ht\/account\/?$/.test(new URL(page.url()).pathname), page.url());
  await ctx.close();
  const rec = await newPage();
  await rec.page.goto(`${WEB}/ht/auth/forgot-password`); await settle(rec.page);
  await sleep(1200);
  await fillAuth(rec.page, { mail: H }); await submit(rec.page);
  const recMails = (await waitMails(H, 2)).filter((m) => /Modpas/.test(m.Subject ?? ""));
  const recFull = recMails.length ? await fullMail(recMails.at(-1)) : null;
  check("the recovery e-mail of a Creole user is in Haitian Creole too", !!recFull && /Chanje modpas ou/.test(recFull.HTML ?? ""), recFull ? "" : "no recovery e-mail");
  await rec.ctx.close();
});

// ===================== D. public pages, OAuth, callback failures ======================
await run("public pages and callback failures", async () => {
  const { ctx, page } = await newPage();
  for (const p of ["/fr", "/fr/products", "/fr/cart", "/fr/reserve", "/fr/search", "/ht"]) {
    const r = await page.goto(`${WEB}${p}`); await settle(page);
    check(`anonymous visitor can open ${p} (no sign-in forced)`, r.status() === 200 && !/\/auth\//.test(page.url()), `${r.status()} ${page.url()}`);
  }
  await page.goto(`${WEB}/fr/auth/callback?error=access_denied&error_code=access_denied&error_description=cancelled`); await settle(page);
  check("OAuth cancellation / failure redirect (error, no code) -> /auth/error, no session", /\/fr\/auth\/error/.test(page.url()) && (await authCookies(ctx)).length === 0, page.url());
  await page.goto(`${WEB}/fr/auth/login`); await settle(page);
  check(EXPECT_OAUTH ? "the Google button shows on login (provider listed at build time)" : "no OAuth provider button while NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS is empty", /google/i.test(await body(page)) === EXPECT_OAUTH);
  await ctx.close();
});

await run("provider disabled in Supabase (direct API)", async () => {
  const r = await fetch(`${SB}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(`${WEB}/fr/auth/callback`)}`, { headers: { apikey: KEY }, redirect: "manual" });
  check("Google is NOT enabled in the local Supabase project (the button must stay hidden until it is configured)", r.status >= 400 || (r.headers.get("location") ?? "").includes("error"), `HTTP ${r.status} ${(r.headers.get("location") ?? "").slice(0, 90)}`);
});

await browser.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
