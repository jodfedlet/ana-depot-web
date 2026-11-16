/**
 * REAL-INFRASTRUCTURE browser suite (not mocks): drives the built web app (`next start`) against
 *  - a LOCAL Supabase stack (real GoTrue + Mailpit mail catcher; see ../../../ana-depot-api/docs/local-supabase.md), and
 *  - the real Spring Boot API (real JWT validation through JWKS, real staff table).
 * It proves our screens work with real Supabase behavior. It is NOT a test of a hosted Supabase project.
 *
 * Required environment (all local):
 *   WEB_URL            default http://127.0.0.1:3100
 *   SUPABASE_URL       default http://127.0.0.1:54321
 *   SUPABASE_PUBLIC_KEY  the local publishable/anon key (public)
 *   MAIL_URL           default http://127.0.0.1:54324 (Mailpit)
 *   STAFF_EMAIL / STAFF_PASSWORD   a REAL Supabase user that was provisioned as staff in the backend (bootstrap)
 *   CHROMIUM_PATH      optional path to a Chromium executable
 * Usage: node e2e/real-supabase/run.mjs   (or: npm run e2e:real)
 */
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3100";
const SB = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_PUBLIC_KEY;
const MAIL = process.env.MAIL_URL ?? "http://127.0.0.1:54324";
if (!KEY || !process.env.STAFF_EMAIL || !process.env.STAFF_PASSWORD) {
  console.error("Set SUPABASE_PUBLIC_KEY, STAFF_EMAIL and STAFF_PASSWORD (see the header of this file).");
  process.exit(2);
}
const results = [];
const check = (name, ok, extra = "") => { results.push({ ok, name, extra }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${String(extra).slice(0, 160)}]` : ""}`); };
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script`, false, e.message.split("\n")[0]); } };

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = `${os.homedir()}/.cache/ms-playwright`;
  const dir = fs.readdirSync(base).find((d) => d.startsWith("chromium-"));
  return `${base}/${dir}/chrome-linux64/chrome`;
}
const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 160)}`); });
  return { ctx, page };
}
const text = (page) => page.locator("body").innerText().then((t) => t.replace(/[ ]/g, " "));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mailFor(to, subjectPart, after = 0, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/messages`)).json();
    const m = list.messages.find((x) => x.To.some((a) => a.Address === to) && x.Subject.includes(subjectPart) && new Date(x.Created).getTime() >= after);
    if (m) { const full = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json(); return full; }
    await sleep(500);
  }
  return null;
}
const linkOf = (mail) => mail.HTML.match(/href="([^"]*)"/)[1].replace(/&amp;/g, "&");
async function authApi(path, body, token) {
  const r = await fetch(`${SB}/auth/v1${path}`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const uniq = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;
const PW = "Str0ng-pass-1", PW2 = "N3w-strong-pass-2";

async function register(page, email, loc = "fr") {
  await page.goto(`${WEB}/${loc}/auth/sign-up`); await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(email); await page.getByLabel("Mot de passe", { exact: true }).fill(PW); await page.getByLabel("Confirmer le mot de passe").fill(PW);
  await page.getByRole("button", { name: "Créer le compte" }).click();
}
async function signIn(page, email, pw, loc = "fr") {
  await page.goto(`${WEB}/${loc}/auth/login`); await page.waitForLoadState("networkidle");
  await page.getByLabel("E-mail").fill(email); await page.getByLabel("Mot de passe", { exact: true }).fill(pw);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}

const email = uniq();
let sinceMail = Date.now() - 2000;

// ---------------- 1. registration, privacy, unverified sign-in, resend, verification ----------------
await run("registration", async () => {
  const { ctx, page } = await newPage();
  await register(page, email);
  await page.waitForURL(/auth\/sign-up-success/, { timeout: 20000 });
  const t = await text(page);
  check("REAL: registration lands on the verification-pending screen", /Vérifiez votre e-mail/.test(t));
  check("REAL: pending copy does not claim an account exists/was created for this address", /Si cette adresse peut être utilisée/.test(t) && !/existe déjà|already/i.test(t));
  const m = await mailFor(email, "Confirmation", sinceMail);
  check("REAL: Supabase sent a verification e-mail (read from Mailpit)", !!m, m?.Subject);

  // unverified sign-in
  const b = await newPage();
  await signIn(b.page, email, PW);
  await b.page.getByText("pas encore vérifiée").waitFor({ timeout: 15000 });
  check("REAL: sign-in before verification is rejected with the translated 'not verified' message", true);
  await b.page.getByRole("button", { name: "Renvoyer l'e-mail de vérification" }).click();
  await b.page.getByText("il vient d'être renvoyé").first().waitFor({ timeout: 15000 });
  check("REAL: resend verification shows success", true);
  await sleep(1500);
  await b.ctx.close();

  // wrong password on an UNVERIFIED account must not reveal that the account exists (same message as unknown e-mail)
  const w = await newPage(); await signIn(w.page, email, "Wrong-pass-9"); await w.page.getByText("L'e-mail ou le mot de passe est incorrect.").waitFor({ timeout: 15000 });
  check("REAL: wrong password on an unverified account gives the generic invalid-credentials message", true);
  const w2 = await newPage(); await signIn(w2.page, "nobody-" + email, "Wrong-pass-9"); await w2.page.getByText("L'e-mail ou le mot de passe est incorrect.").waitFor({ timeout: 15000 });
  check("REAL: unknown e-mail gives the identical message", true);
  await w.ctx.close(); await w2.ctx.close();

  // verification link opened in the SAME browser that registered (PKCE verifier cookie lives there)
  const mails = await (await fetch(`${MAIL}/api/v1/messages`)).json();
  const latest = mails.messages.filter((x) => x.To.some((a) => a.Address === email)).sort((a, c) => new Date(c.Created) - new Date(a.Created))[0];
  const link = linkOf(await (await fetch(`${MAIL}/api/v1/message/${latest.ID}`)).json());
  await page.goto(link); await page.waitForLoadState("networkidle");
  check("REAL: verification link (token_hash, resent mail) ends on a signed-in / verified screen", /\/fr\/account/.test(page.url()), page.url());
  await ctx.close();
});

// ---------------- 2. sign-in, persistence, protected pages, sign-out ----------------
await run("session", async () => {
  const { ctx, page } = await newPage();
  await signIn(page, email, PW);
  await page.waitForURL(/\/fr\/account/, { timeout: 20000 });
  check("REAL: sign-in with the real account reaches /fr/account", true);
  await page.reload(); await page.waitForLoadState("networkidle");
  check("REAL: session persists across a reload (cookie session)", /\/fr\/account/.test(page.url()) && (await page.getByLabel("Mot de passe", { exact: true }).count()) === 0);
  const cookies = await ctx.cookies();
  const authCookies = cookies.filter((c) => /^sb-.*-auth-token/.test(c.name));
  check("REAL: the session lives in cookies (not a password): sb-*-auth-token present", authCookies.length > 0, authCookies.map((c) => c.name).join(","));
  const ls = await page.evaluate(() => JSON.stringify(Object.keys(localStorage)));
  check("REAL: no auth token or password in localStorage", !/sb-|token|password/i.test(ls), ls);
  // expired/revoked session: revoke it at Supabase from OUTSIDE, then use the app
  const access = decodeURIComponent(authCookies.map((c) => c.value).join(""));
  const raw = access.startsWith("base64-") ? Buffer.from(access.slice(7), "base64").toString() : access;
  const tok = JSON.parse(raw).access_token;
  const out = await fetch(`${SB}/auth/v1/logout?scope=global`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${tok}` } });
  check("REAL: Supabase revoked the session (global logout)", out.status === 204, out.status);
  await page.goto(`${WEB}/fr/account`); await page.waitForLoadState("networkidle");
  check("REAL: a revoked session can no longer open /fr/account (redirected to /fr/auth/login)", /\/fr\/auth\/login/.test(page.url()), page.url());
  await ctx.close();

  const c2 = await newPage(); await signIn(c2.page, email, PW); await c2.page.waitForURL(/\/fr\/account/);
  await c2.page.getByRole("button", { name: "Se déconnecter" }).first().click();
  await c2.page.waitForURL(/auth\/login/, { timeout: 15000 });
  check("REAL: sign-out returns to sign-in with the confirmation", /Vous êtes déconnecté/.test(await text(c2.page)));
  await c2.page.goto(`${WEB}/fr/account`); await c2.page.waitForLoadState("networkidle");
  check("REAL: after sign-out the account page is protected", /\/fr\/auth\/login/.test(c2.page.url()));
  await c2.ctx.close();
  const anon = await newPage(); await anon.page.goto(`${WEB}/fr/account/profile`); await anon.page.waitForLoadState("networkidle");
  check("REAL: anonymous visitor on a protected account page is sent to sign-in", /auth\/login/.test(anon.page.url()));
  await anon.ctx.close();
});

// ---------------- 2b. session refresh (expired access token + valid refresh token) ----------------
await run("refresh", async () => {
  const { ctx, page } = await newPage();
  await signIn(page, email, PW); await page.waitForURL(/\/fr\/account/, { timeout: 20000 });
  const readSession = async () => {
    const cs = (await ctx.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
    const raw = decodeURIComponent(cs.map((c) => c.value).join(""));
    return { cs, session: JSON.parse(raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString() : raw) };
  };
  const before = await readSession();
  // make the app believe the access token has expired (the refresh token stays valid at Supabase)
  const aged = { ...before.session, expires_at: Math.floor(Date.now() / 1000) - 120 };
  const enc = "base64-" + Buffer.from(JSON.stringify(aged)).toString("base64url");
  await ctx.clearCookies();
  await ctx.addCookies([{ name: before.cs[0].name.replace(/\.\d+$/, ""), value: encodeURIComponent(enc), domain: "127.0.0.1", path: "/", sameSite: "Lax" }]);
  const r = await page.goto(`${WEB}/fr/account`); await page.waitForLoadState("networkidle");
  check("REAL: an expired access token with a valid refresh token still opens /fr/account (proxy refreshes the session)", /\/fr\/account/.test(page.url()) && r.status() === 200, page.url());
  const after = await readSession();
  check("REAL: Supabase issued a NEW access and refresh token (cookie rotated)", after.session.access_token !== before.session.access_token && after.session.refresh_token !== before.session.refresh_token);
  check("REAL: the new session is no longer expired", after.session.expires_at > Math.floor(Date.now() / 1000) + 60, String(after.session.expires_at - Math.floor(Date.now() / 1000)));
  // the OLD refresh token has been rotated out: replaying it must fail at Supabase (reuse detection or invalid)
  const replay = await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: before.session.refresh_token }) });
  console.log(`INFO  replaying the previous refresh token immediately after rotation: HTTP ${replay.status} (GoTrue keeps a short reuse window; recorded, not asserted)`);
  await ctx.close();
});

// ---------------- 3. wrong password, forgot / reset ----------------
await run("recovery", async () => {
  const { ctx, page } = await newPage();
  await signIn(page, email, "Wrong-pass-9");
  await page.getByText("L'e-mail ou le mot de passe est incorrect.").waitFor({ timeout: 15000 });
  check("REAL: wrong password shows the translated invalid-credentials error", true);
  await ctx.close();

  const r = await newPage();
  const t0 = Date.now() - 1000;
  await r.page.goto(`${WEB}/fr/auth/forgot-password`); await r.page.waitForLoadState("networkidle");
  await r.page.getByLabel("E-mail").fill(email); await r.page.getByRole("button", { name: "Envoyer le lien" }).click();
  await r.page.getByText("Consultez vos e-mails").waitFor({ timeout: 15000 });
  check("REAL: forgot-password shows the neutral confirmation", true);
  const rec = await mailFor(email, "Mot de passe", t0); check("REAL: recovery e-mail delivered (Mailpit)", !!rec, rec?.Subject);
  // an UNKNOWN address gets the identical screen (no enumeration in our UI)
  const u = await newPage(); await u.page.goto(`${WEB}/fr/auth/forgot-password`); await u.page.waitForLoadState("networkidle");
  await u.page.getByLabel("E-mail").fill("nobody-" + email); await u.page.getByRole("button", { name: "Envoyer le lien" }).click();
  await u.page.getByText("Consultez vos e-mails").waitFor({ timeout: 15000 });
  check("REAL: unknown address gets the identical neutral confirmation", true); await u.ctx.close();

  await r.ctx.close(); Object.assign(r, await newPage()); // a DIFFERENT browser context: the server-side token_hash link must not need the requesting browser
  await r.page.goto(linkOf(rec)); await r.page.waitForLoadState("networkidle");
  check("REAL: recovery link opened in a DIFFERENT browser lands on the update-password block", /auth\/update-password/.test(r.page.url()) && (await r.page.getByLabel("Nouveau mot de passe", { exact: true }).count()) === 1, r.page.url());
  await r.page.getByLabel("Nouveau mot de passe", { exact: true }).fill(PW2);
  await r.page.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
  await r.page.waitForURL(/\/fr\/account/, { timeout: 20000 });
  check("REAL: password reset succeeds and signs the person in (/fr/account)", true);
  await r.ctx.close();

  const old = await newPage(); await signIn(old.page, email, PW); await old.page.getByText("L'e-mail ou le mot de passe est incorrect.").waitFor({ timeout: 15000 });
  check("REAL: the OLD password no longer works", true); await old.ctx.close();
  const nw = await newPage(); await signIn(nw.page, email, PW2); await nw.page.waitForURL(/\/fr\/account/, { timeout: 20000 });
  check("REAL: the NEW password works", true); await nw.ctx.close();
  // reused recovery link
  const again = await newPage(); await again.page.goto(linkOf(rec)); await again.page.waitForLoadState("networkidle");
  check("REAL: a used recovery link lands on /auth/error, not on the form", /auth\/error/.test(again.page.url()) && (await again.page.getByLabel("Nouveau mot de passe", { exact: true }).count()) === 0 && /Ce lien ne fonctionne pas/.test(await text(again.page)), again.page.url());
  await again.ctx.close();
});

// ---------------- 4. already-registered sign-up must look like a new sign-up ----------------
await run("privacy", async () => {
  const { ctx, page } = await newPage();
  await register(page, email); // this address is CONFIRMED and has an account
  await page.waitForURL(/auth\/sign-up-success/, { timeout: 20000 });
  const t = await text(page);
  check("REAL: signing up with an already-registered address shows the SAME pending screen", /Vérifiez votre e-mail/.test(t) && /Si cette adresse peut être utilisée/.test(t) && !/déjà un compte existe|already registered/i.test(t));
  await ctx.close();
  const direct = await authApi("/signup", { email, password: PW });
  check("REAL FINDING: the provider API itself still discloses a confirmed account (HTTP 422 user_already_exists) to anyone holding the public key", direct.status === 422 && direct.body?.error_code === "user_already_exists", `${direct.status} ${direct.body?.error_code}`);
});

// ---------------- 5. admin gating against the REAL backend ----------------
await run("admin", async () => {
  const anon = await newPage(); await anon.page.goto(`${WEB}/fr/admin`); await anon.page.waitForLoadState("networkidle");
  check("REAL: anonymous /fr/admin redirects to /fr/auth/login?next=/admin", /\/fr\/auth\/login\?next=%2Fadmin/.test(anon.page.url()), anon.page.url());
  const bodyAnon = await text(anon.page); check("REAL: no admin data in the anonymous response", !/Réservations\b.*Produits\b.*Inventaire/s.test(bodyAnon)); await anon.ctx.close();

  const cust = await newPage(); await signIn(cust.page, email, PW2); await cust.page.waitForURL(/\/fr\/account/, { timeout: 20000 });
  await cust.page.goto(`${WEB}/fr/admin`); await cust.page.waitForLoadState("networkidle");
  const tc = await text(cust.page);
  check("REAL: a real customer (valid session, not staff) gets 'Accès refusé' from the REAL backend", /Accès refusé/.test(tc), cust.page.url());
  check("REAL: no admin navigation is rendered for the customer", !/Inventaire/.test(tc)); await cust.ctx.close();

  const staff = await newPage();
  await staff.page.goto(`${WEB}/fr/admin`); await staff.page.waitForLoadState("networkidle"); // redirected to the block login with next=/admin
  await staff.page.getByLabel("E-mail").fill(process.env.STAFF_EMAIL); await staff.page.getByLabel("Mot de passe", { exact: true }).fill(process.env.STAFF_PASSWORD);
  await staff.page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await staff.page.waitForURL(/\/fr\/admin$/, { timeout: 20000 });
  await staff.page.getByText("Tableau de bord").first().waitFor({ timeout: 15000 });
  const ts = await text(staff.page);
  check("REAL: the real staff user (member in the backend table) reaches the admin shell", /Tableau de bord/.test(ts) && /Inventaire/.test(ts), staff.page.url());
  await staff.ctx.close();
});

// ---------------- 6. old custom forms / routes are gone; the block is rendered; requests go to the configured Supabase ----------------
await run("block", async () => {
  const { ctx, page } = await newPage();
  const sbCalls = [];
  page.on("request", (rq) => { if (/\/auth\/v1\//.test(rq.url())) sbCalls.push(rq.url()); });
  for (const p of ["login", "sign-up", "forgot-password", "update-password"]) {
    await page.goto(`${WEB}/fr/auth/${p}`); await page.waitForLoadState("networkidle");
    const labels = await page.locator("label").allInnerTexts();
    check(`REAL: /fr/auth/${p} shows no OLD-form field (Prénom, Nom, Confirmer le nouveau mot de passe)`, !labels.some((l) => /^(Prénom|Nom)$|Confirmer le nouveau/.test(l.trim())), labels.join("|"));
    check(`REAL: /fr/auth/${p} renders the block (a form with labelled inputs) and no demo notice`, (await page.locator("form input").count()) > 0 && !/démo|demo/i.test(await text(page).then((t) => t.slice(0, 600))));
  }
  const guest = page.getByRole("link", { name: "Continuer sans compte" });
  await page.goto(`${WEB}/fr/auth/login`); await page.waitForLoadState("networkidle");
  check("REAL: 'Continuer sans compte' is a plain link OUTSIDE the form", (await guest.count()) === 1 && (await page.locator("form a", { hasText: "Continuer sans compte" }).count()) === 0);
  await page.getByLabel("E-mail").fill("nobody@example.test"); await page.getByLabel("Mot de passe", { exact: true }).fill("Wrong-pass-9");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.getByText("L'e-mail ou le mot de passe est incorrect.").waitFor({ timeout: 15000 });
  check("REAL: the sign-in request goes to the configured Supabase URL", sbCalls.some((u) => u.startsWith(`${SB}/auth/v1/token`)), sbCalls.slice(0, 2).join(","));
  check("REAL: every Supabase request targets the configured host only", sbCalls.every((u) => u.startsWith(SB)));
  for (const [from, to] of [["/login", "/fr/auth/login"], ["/fr/sign-in", "/fr/auth/login"], ["/fr/register", "/fr/auth/sign-up"], ["/fr/forgot-password", "/fr/auth/forgot-password"], ["/fr/reset-password", "/fr/auth/update-password"], ["/fr/admin/sign-in", "/fr/auth/login"]]) {
    await page.goto(`${WEB}${from}`); await page.waitForLoadState("networkidle");
    check(`REAL: legacy ${from} redirects to ${to}`, page.url().includes(to), page.url());
  }
  await ctx.close();
});

// ---------------- 7. guests are unaffected ----------------
await run("guest", async () => {
  const { ctx, page } = await newPage();
  for (const p of ["/fr", "/fr/products", "/fr/cart", "/fr/reserve", "/fr/reservations"]) {
    const r = await page.goto(`${WEB}${p}`); await page.waitForLoadState("networkidle");
    check(`REAL: guest can open ${p} without any account (HTTP ${r.status()})`, r.status() === 200 && !/auth\/login/.test(page.url()));
  }
  await ctx.close();
});

check("no unexpected console/page errors during the real-infrastructure run", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(`\n${results.filter((r) => r.ok).length} passed, ${results.filter((r) => !r.ok).length} failed`);
await browser.close();
process.exit(results.some((r) => !r.ok) ? 1 : 0);
