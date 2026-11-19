/**
 * TEAM + STAFF SECOND FACTOR browser suite — LOCAL STACK: the real Spring Boot API (started with ANA_STAFF_REQUIRE_MFA=true) and a LOCAL Supabase stack with TOTP MFA enabled
 * (dev/supabase/config.toml). Not a hosted Supabase test. Run with `npm run e2e:team`; setup as e2e/storefront/README.md plus:
 *   - the API MUST run with ANA_STAFF_REQUIRE_MFA=true (the other suites need it OFF: they sign in staff without a second factor)
 *   - SUPABASE_LOCAL_SECRET_KEY = the LOCAL stack's secret key (creates throw-away users, removes their factors; never used in a browser)
 */
import crypto from "node:crypto";
import { bodyText, check, env, launch, newPage, overflow, pageErrors, section, settle, shot, sleep } from "../storefront/lib.mjs";

const SK = process.env.SUPABASE_LOCAL_SECRET_KEY;
if (!SK) { console.error("Set SUPABASE_LOCAL_SECRET_KEY (the LOCAL Supabase stack's secret key)."); process.exit(2); }
const PASSWORD = "Str0ng-pass-1";
const gotrue = (path, init = {}) => fetch(`${env.SB}/auth/v1${path}`, { ...init, headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

// ---- RFC 6238 TOTP (SHA-1, 30 s, 6 digits) computed from the base32 secret the page shows --------------------------------------------------------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret, at = Date.now()) {
  const bits = [...secret.replace(/[\s=]/g, "").toUpperCase()].map((c) => B32.indexOf(c).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

const tokenOf = async (email) => (await (await fetch(`${env.SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: email === env.STAFF_EMAIL ? env.STAFF_PASSWORD : PASSWORD }) })).json()).access_token;
const api = async (method, path, token, body) => { const r = await fetch(`${env.API}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* not json */ } return { status: r.status, body: j }; };
async function userByEmail(email) { const list = (await (await gotrue("/admin/users?per_page=200")).json()).users ?? []; return list.find((u) => u.email === email); }
async function dropFactors(userId) { for (const f of (await (await gotrue(`/admin/users/${userId}/factors`)).json()) ?? []) await gotrue(`/admin/users/${userId}/factors/${f.id}`, { method: "DELETE" }); }
async function createUser(email) { const r = await gotrue("/admin/users", { method: "POST", body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) }); return (await r.json()).id; }

const browser = await launch();
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script`, false, `${String(e.message).split("\n")[0]} @ ${(String(e.stack).match(/team\.mjs:(\d+)/) ?? [])[1] ?? "?"}`); } };

async function signIn(page, email, password, next) {
  await page.goto(`${env.WEB}/fr/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await settle(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((u) => !/auth\/login/.test(u.pathname), { timeout: 20000 });
  await settle(page);
}
/** Enrols a TOTP factor through the real UI and returns its base32 secret. */
async function enrolThroughUi(page) {
  await page.getByRole("button", { name: "Configurer la vérification" }).click();
  await page.getByAltText(/QR code/i).waitFor({ timeout: 15000 });
  const secret = (await page.locator("span.select-all").innerText()).trim();
  await page.getByLabel("Code à 6 chiffres").fill(totp(secret));
  await page.getByRole("button", { name: "Vérifier", exact: true }).click();
  return secret;
}

const stamp = Date.now();
const colleagueEmail = `colleague-${stamp}@example.test`;
const intruderEmail = `intruder-${stamp}@example.test`;
let staffSecret = null;

await run("api", async () => {
  section("A. The API refuses a staff session without a second factor");
  const staffUser = await userByEmail(env.STAFF_EMAIL);
  await dropFactors(staffUser.id);                        // a clean slate: the secret of an earlier run is gone
  const weak = await tokenOf(env.STAFF_EMAIL);
  const me = await api("GET", "/me", weak);
  check("a staff member without aal2 is NOT staff yet and is told a second factor is needed", me.status === 200 && me.body.staff === false && me.body.mfaRequired === true, JSON.stringify(me.body).slice(0, 120));
  const denied = await api("GET", "/admin/settings/pickup", weak);
  check("the administration answers 403 mfa_required", denied.status === 403 && denied.body.code === "mfa_required", `${denied.status} ${denied.body?.code}`);
  const cEmail = `plain-${stamp}@example.test`; await createUser(cEmail);
  const cMe = await api("GET", "/me", await tokenOf(cEmail));
  check("a plain customer is never asked for a second factor", cMe.body.staff === false && cMe.body.mfaRequired === false);
});

await run("mfa", async () => {
  section("B. Staff second factor in the browser (real GoTrue TOTP)");
  const { ctx, page } = await newPage(browser);
  await signIn(page, env.STAFF_EMAIL, env.STAFF_PASSWORD, "/admin");
  await settle(page);
  let t = await bodyText(page);
  check("after sign-in the administration shows ONLY the verification step", /Vérification en deux étapes/.test(t) && !/Tableau de bord|Réservations|Inventaire/.test(t), t.slice(0, 100));
  await shot(page, "team-mfa-start");
  staffSecret = await enrolThroughUi(page);
  await page.waitForFunction(() => /Tableau de bord/.test(document.body.innerText), null, { timeout: 20000 });   // the page reloads after verification: wait for the dashboard itself, not the URL
  await settle(page, 600);
  t = await bodyText(page);
  check("a correct code from the authenticator opens the administration", /Tableau de bord/.test(t), t.slice(0, 80));
  const tok = await page.evaluate(() => JSON.parse(atob(((document.cookie.match(/sb-[^=]+-auth-token=([^;]+)/) ?? [])[1] ?? "").replace(/^base64-/, "")) || "{}").access_token).catch(() => null);
  if (tok) check("the session now carries aal2 (a signed claim the backend reads)", JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()).aal === "aal2");
  await ctx.close();

  // a NEW sign-in starts at aal1 again: the existing factor is asked for, a wrong code is refused, the right one works
  const second = await newPage(browser);
  await signIn(second.page, env.STAFF_EMAIL, env.STAFF_PASSWORD, "/admin");
  t = await bodyText(second.page);
  check("signing in again asks for the code of the existing factor (no second enrolment)", /Saisissez le code à 6 chiffres/.test(t) && !/QR code/i.test(t));
  await second.page.getByLabel("Code à 6 chiffres").fill("000000");
  await second.page.getByRole("button", { name: "Vérifier", exact: true }).click();
  await second.page.getByText(/Code incorrect ou expiré/).waitFor({ timeout: 10000 });
  check("a wrong code is refused with a plain message and nothing opens", !/Tableau de bord/.test(await bodyText(second.page)));
  await second.page.getByLabel("Code à 6 chiffres").fill(totp(staffSecret));
  await second.page.getByRole("button", { name: "Vérifier", exact: true }).click();
  await second.page.waitForFunction(() => /Tableau de bord/.test(document.body.innerText), null, { timeout: 20000 });
  check("the right code opens the administration", true);
  await second.ctx.close();
});

await run("team", async () => {
  section("C. Invite a colleague with a one-time code; the colleague joins; access can be removed and restored");
  const colleagueId = await createUser(colleagueEmail);
  await createUser(intruderEmail);
  const owner = await newPage(browser);
  await signIn(owner.page, env.STAFF_EMAIL, env.STAFF_PASSWORD, "/admin");
  await owner.page.getByLabel("Code à 6 chiffres").fill(totp(staffSecret));
  await owner.page.getByRole("button", { name: "Vérifier", exact: true }).click();
  await owner.page.waitForFunction(() => /Tableau de bord/.test(document.body.innerText), null, { timeout: 20000 });
  await owner.page.goto(`${env.WEB}/fr/admin/team`);
  await settle(owner.page, 1200);
  let t = await bodyText(owner.page);
  const ownRow = owner.page.locator("li", { hasText: "Vous" });
  check("the Team page lists the signed-in member as the current user, with no removal button on their own row", /Équipe/.test(t) && (await ownRow.count()) === 1 && (await ownRow.getByRole("button").count()) === 0);
  await shot(owner.page, "team-page-d");

  await owner.page.getByRole("button", { name: "Inviter", exact: true }).click();
  await owner.page.getByLabel(/Pour qui/).fill(`Marie e2e ${stamp}`);
  await owner.page.getByRole("button", { name: "Créer le code" }).click();
  const codeEl = owner.page.getByTestId("invitation-code");
  await codeEl.waitFor({ timeout: 15000 });
  const code = (await codeEl.innerText()).trim();
  check("the code is shown once, in readable groups", /^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/.test(code), code.replace(/./g, "•").slice(0, 8));
  check("the dialog warns that the code will never be shown again", /plus jamais affiché/.test(await bodyText(owner.page)));
  await shot(owner.page, "team-code-d");
  await owner.page.getByRole("button", { name: "J'ai transmis le code" }).click();
  await settle(owner.page);
  t = await bodyText(owner.page);
  check("afterwards the invitation is listed as pending and the code is nowhere on the page", new RegExp(`Marie e2e ${stamp}`).test(t) && /En attente/.test(t) && !t.includes(code) && !t.includes(code.replaceAll("-", "")));

  // a signed-in stranger tries a wrong code, then the colleague uses the real one through the link (code in the fragment)
  const intruder = await newPage(browser);
  await signIn(intruder.page, intruderEmail, PASSWORD);
  await intruder.page.goto(`${env.WEB}/fr/account/join-team`);
  await settle(intruder.page);
  await intruder.page.getByLabel("Code d'invitation").fill("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF");
  await intruder.page.getByRole("button", { name: "Rejoindre l'équipe" }).click();
  await intruder.page.getByText(/n'est pas valide/).waitFor({ timeout: 10000 });
  check("a wrong code is refused with the same plain message", true);
  await intruder.page.goto(`${env.WEB}/fr/admin`); await settle(intruder.page);
  check("the stranger still has no access to the administration", !/Tableau de bord/.test(await bodyText(intruder.page)));
  await intruder.ctx.close();

  const colleague = await newPage(browser);
  await signIn(colleague.page, colleagueEmail, PASSWORD);
  await colleague.page.goto(`${env.WEB}/fr/account/join-team#code=${code}`);
  await settle(colleague.page);
  check("the code from the link prefills the field", (await colleague.page.getByLabel("Code d'invitation").inputValue()) === code);
  await colleague.page.getByRole("button", { name: "Rejoindre l'équipe" }).click();
  await colleague.page.getByText(/faites maintenant partie de l'équipe/).waitFor({ timeout: 15000 });
  check("the colleague joins and the code leaves the address bar", !/code=/.test(colleague.page.url()));
  await shot(colleague.page, "team-joined-m");

  // the colleague is now team, but this deployment requires a second factor: only the verification step shows until they enrol
  await colleague.page.goto(`${env.WEB}/fr/admin`); await settle(colleague.page);
  check("the new member must set up a second factor before seeing anything", /Vérification en deux étapes/.test(await bodyText(colleague.page)) && !/Tableau de bord/.test(await bodyText(colleague.page)));
  await enrolThroughUi(colleague.page);
  await colleague.page.waitForFunction(() => /Tableau de bord/.test(document.body.innerText), null, { timeout: 20000 });
  check("after enrolling the colleague uses the administration", true);

  // the same code cannot be reused by anyone
  const late = await newPage(browser);
  const lateEmail = `late-${stamp}@example.test`; await createUser(lateEmail);
  await signIn(late.page, lateEmail, PASSWORD);
  await late.page.goto(`${env.WEB}/fr/account/join-team#code=${code}`); await settle(late.page);
  await late.page.getByRole("button", { name: "Rejoindre l'équipe" }).click();
  await late.page.getByText(/n'est pas valide/).waitFor({ timeout: 10000 });
  check("a used code cannot be used again", true);
  await late.ctx.close();

  // the owner sees the new member, removes their access (confirmation), the colleague loses the administration at once, then access is restored
  await owner.page.reload(); await settle(owner.page, 1200);
  t = await bodyText(owner.page);
  check("the Team page lists the new member as active, and the finished invitation is no longer in the way (history is one click away)", new RegExp(`Marie e2e ${stamp}`).test(t) && /Actif/.test(t) && !/Acceptée/.test(t));
  await owner.page.getByRole("button", { name: "Voir les invitations passées" }).click();
  check("the history shows it as accepted", /Acceptée/.test(await bodyText(owner.page)));
  await owner.page.getByRole("button", { name: "Masquer les invitations passées" }).click();   // a member without a customer profile is identified by the inviter's note: the backend never learns other users' e-mails
  const row = owner.page.locator("li", { hasText: `Marie e2e ${stamp}` }).filter({ has: owner.page.getByRole("button", { name: "Retirer l'accès" }) });
  await row.getByRole("button", { name: "Retirer l'accès" }).click();
  const dialog = owner.page.getByRole("dialog");
  check("removing access asks for confirmation first", /ne pourra plus utiliser l'administration/.test(await dialog.innerText()));
  await dialog.getByRole("button", { name: "Retirer l'accès" }).click();
  await owner.page.getByText("Accès retiré.").first().waitFor({ timeout: 10000 });
  await colleague.page.reload(); await settle(colleague.page);
  const ct = await bodyText(colleague.page);
  check("the removed member loses the administration on their next page load", !/Tableau de bord/.test(ct), ct.slice(0, 80));
  const removedRow = owner.page.locator("li", { hasText: `Marie e2e ${stamp}` }).filter({ has: owner.page.getByRole("button", { name: "Rétablir l'accès" }) });
  await removedRow.getByRole("button", { name: "Rétablir l'accès" }).click();
  await owner.page.getByText("Accès rétabli.").first().waitFor({ timeout: 10000 });
  await colleague.page.reload(); await settle(colleague.page, 1000);
  check("and gets it back when restored", /Tableau de bord/.test(await bodyText(colleague.page)) || /Vérification en deux étapes/.test(await bodyText(colleague.page)));

  // revoke a pending invitation
  await owner.page.getByRole("button", { name: "Inviter", exact: true }).click();
  await owner.page.getByLabel(/Pour qui/).fill(`À annuler ${stamp}`);
  await owner.page.getByRole("button", { name: "Créer le code" }).click();
  await owner.page.getByTestId("invitation-code").waitFor();
  const revokedCode = (await owner.page.getByTestId("invitation-code").innerText()).trim();
  await owner.page.getByRole("button", { name: "J'ai transmis le code" }).click(); await settle(owner.page);
  await owner.page.locator("li", { hasText: `À annuler ${stamp}` }).getByRole("button", { name: "Annuler l'invitation" }).click();
  await owner.page.getByText("Invitation annulée.").first().waitFor({ timeout: 10000 });
  const res = await api("POST", "/me/staff-invitation", await tokenOf(intruderEmail), { code: revokedCode });
  check("a revoked invitation can no longer be redeemed", res.status === 404 && res.body.code === "invitation_invalid", `${res.status} ${res.body?.code}`);

  // the last active member can never be removed: the owner cannot remove themselves (no button), the API refuses too
  const self = (await api("GET", "/admin/staff", await tokenOf(env.STAFF_EMAIL)));
  check("without the second factor the API gives a team member nothing (403)", self.status === 403);
  await owner.ctx.close(); await colleague.ctx.close();
  void colleagueId;
});

await run("recovery", async () => {
  section("C2. Recovery codes (D15): make a set, lose the authenticator, get in with one code, once");
  const owner = await newPage(browser);
  await signIn(owner.page, env.STAFF_EMAIL, env.STAFF_PASSWORD, "/admin");
  await owner.page.getByLabel("Code à 6 chiffres").fill(totp(staffSecret));
  await owner.page.getByRole("button", { name: "Vérifier", exact: true }).click();
  await owner.page.waitForFunction(() => /Tableau de bord/.test(document.body.innerText), null, { timeout: 20000 });
  await owner.page.goto(`${env.WEB}/fr/admin/security`); await settle(owner.page, 1200);
  check("with no codes yet the page says so", /aucun code de récupération/.test(await bodyText(owner.page)));
  await owner.page.getByRole("button", { name: "Créer de nouveaux codes" }).click();
  await owner.page.getByRole("dialog").getByRole("button", { name: "Créer les codes" }).click();
  const list = owner.page.getByTestId("recovery-codes");
  await list.waitFor({ timeout: 15000 });
  const codes = (await list.locator("li").allInnerTexts()).map((c) => c.trim());
  check("ten codes in readable groups are shown, with the warning that they will not be shown again", codes.length === 10 && codes.every((c) => /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(c)) && /plus jamais affichés/.test(await bodyText(owner.page)));
  await shot(owner.page, "recovery-codes-d");
  await owner.page.getByRole("button", { name: "J'ai noté mes codes" }).click(); await settle(owner.page, 600);
  const after = await bodyText(owner.page);
  check("afterwards only the count is visible, never a code", /10 codes de récupération restants/.test(after) && !codes.some((c) => after.includes(c)));
  await owner.page.goto(`${env.WEB}/fr/admin/team`); await settle(owner.page, 1200);
  check("the Team page shows how many recovery codes each member has (never the codes)", /Codes de récupération : 10/.test(await bodyText(owner.page)));
  await owner.ctx.close();

  // the authenticator is lost: a brand-new sign-in has only the password
  const lost = await newPage(browser);
  await signIn(lost.page, env.STAFF_EMAIL, env.STAFF_PASSWORD, "/admin");
  await lost.page.getByRole("button", { name: "J'ai perdu mon application d'authentification" }).click();
  check("the verification screen offers a recovery code", /Code de récupération/.test(await bodyText(lost.page)) && !/Tableau de bord/.test(await bodyText(lost.page)));
  await lost.page.getByLabel("Code de récupération").fill("AAAA-BBBB-CCCC-DDDD");
  await lost.page.getByRole("button", { name: "Utiliser ce code" }).click();
  await lost.page.getByText(/n'est pas valide/).waitFor({ timeout: 10000 });
  check("a wrong code is refused and nothing opens", !/Tableau de bord/.test(await bodyText(lost.page)));
  await lost.page.getByLabel("Code de récupération").fill(codes[0].toLowerCase());
  await lost.page.getByRole("button", { name: "Utiliser ce code" }).click();
  await lost.page.waitForFunction(() => /Tableau de bord/.test(document.body.innerText), null, { timeout: 20000 });
  await settle(lost.page, 800);
  check("a recovery code opens the administration and says the access is limited", /connecté avec un code de récupération/.test(await bodyText(lost.page)));
  await shot(lost.page, "recovery-session-banner-d");
  await lost.page.goto(`${env.WEB}/fr/admin/security`); await settle(lost.page, 1200);
  check("the used code is gone (9 left) and a new set can be made from the recovered session", /9 codes de récupération restants/.test(await bodyText(lost.page)) && (await lost.page.getByRole("button", { name: "Créer de nouveaux codes" }).count()) === 1);
  check("no horizontal overflow on the security page", (await overflow(lost.page)) <= 0, String(await overflow(lost.page)));
  await lost.ctx.close();

  // the same code in yet another sign-in: refused, and that sign-in stays outside
  const again = await newPage(browser);
  await signIn(again.page, env.STAFF_EMAIL, env.STAFF_PASSWORD, "/admin");
  await again.page.getByRole("button", { name: "J'ai perdu mon application d'authentification" }).click();
  await again.page.getByLabel("Code de récupération").fill(codes[0]);
  await again.page.getByRole("button", { name: "Utiliser ce code" }).click();
  await again.page.getByText(/n'est pas valide/).waitFor({ timeout: 10000 });
  check("a used code cannot open another sign-in", !/Tableau de bord/.test(await bodyText(again.page)));
  const weakToken = await tokenOf(env.STAFF_EMAIL);
  const probe = await api("GET", "/admin/reservations", weakToken);
  check("and the API still answers 403 mfa_required to a password-only session", probe.status === 403 && probe.body?.code === "mfa_required", `${probe.status} ${probe.body?.code}`);
  await again.ctx.close();
});

await run("layout", async () => {
  section("D. Mobile and Haitian Creole");
  const m = await newPage(browser, { width: 390, height: 844 });
  await signIn(m.page, env.STAFF_EMAIL, env.STAFF_PASSWORD, "/admin");
  await m.page.getByLabel("Code à 6 chiffres").fill(totp(staffSecret));
  await m.page.getByRole("button", { name: "Vérifier", exact: true }).click();
  await m.page.waitForFunction(() => /Tableau de bord/.test(document.body.innerText), null, { timeout: 20000 });
  await m.page.goto(`${env.WEB}/fr/admin/team`); await settle(m.page, 1200);
  check("the Team page does not scroll sideways at 390 px", (await overflow(m.page)) <= 0, String(await overflow(m.page)));
  await shot(m.page, "team-page-m");
  await m.page.goto(`${env.WEB}/ht/admin/team`); await settle(m.page, 1200);
  const t = await bodyText(m.page);
  check("the Team page is available in Haitian Creole", /Ekip la/.test(t) && /Envite/.test(t) && /Manm yo/.test(t));
  await sleep(100);
  await m.ctx.close();
  check("no browser errors during the run", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
});

await browser.close();
const failed = (await import("../storefront/lib.mjs")).results.filter((r) => !r.ok);
console.log(`\n${(await import("../storefront/lib.mjs")).results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
