/**
 * STAFF ROLES browser suite (D14, owner-approved: Owner / Manager / Staff) — LOCAL STACK: real API, LOCAL Supabase (throw-away users made with the local secret key).
 * Proves, for each role, what the screens show AND what the server does (a hidden button is never the protection). Run with `npm run e2e:roles`; setup as
 * e2e/storefront/README.md plus SUPABASE_LOCAL_SECRET_KEY. The API must run with ANA_STAFF_REQUIRE_MFA=false (as for the other suites).
 */
import crypto from "node:crypto";
import { admin, bodyText, check, env, key, launch, newPage, overflow, pageErrors, productBySlug, results, section, settle, shot } from "../storefront/lib.mjs";

const SK = process.env.SUPABASE_LOCAL_SECRET_KEY;
if (!SK) { console.error("Set SUPABASE_LOCAL_SECRET_KEY (the LOCAL Supabase stack's secret key)."); process.exit(2); }
const PASSWORD = "Str0ng-pass-1";
const stamp = Date.now();
const gotrue = (path, init = {}) => fetch(`${env.SB}/auth/v1${path}`, { ...init, headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const createUser = async (email) => (await (await gotrue("/admin/users", { method: "POST", body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })).json()).id;
const tokenOf = async (email, password = PASSWORD) => (await (await fetch(`${env.SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json()).access_token;
const api = async (method, path, token, body) => {
  const r = await fetch(`${env.API}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: r.status, body: json };
};

const browser = await launch();
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script`, false, `${String(e.message).split("\n")[0]} @ ${(String(e.stack).match(/roles\.mjs:(\d+)/) ?? [])[1] ?? "?"}`); } };

async function signIn(page, email, password) {
  await page.goto(`${env.WEB}/fr/auth/login?next=${encodeURIComponent("/admin")}`); await settle(page);
  await page.getByLabel("E-mail").fill(email); await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/fr\/admin/, { timeout: 20000 }); await settle(page, 1200);
}
const navText = async (page) => (await page.locator("nav[aria-label]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
async function openMenuIfMobile(page, width) { if (width < 1024) { await page.getByRole("button", { name: /Ouvrir le menu|menu/i }).first().click(); await settle(page, 500); } }

const ownerToken = await tokenOf(env.STAFF_EMAIL, env.STAFF_PASSWORD);
const people = {};
await run("setup", async () => {
  section("0. Team members of each role, joined by the real invitation flow (API)");
  for (const role of ["MANAGER", "STAFF"]) {
    const email = `${role.toLowerCase()}-${stamp}@example.test`;
    await createUser(email);
    const invite = await api("POST", "/admin/staff/invitations", ownerToken, { note: `${role} e2e ${stamp}`, role });
    const joined = await api("POST", "/me/staff-invitation", await tokenOf(email), { code: invite.body.code });
    people[role] = { email, token: await tokenOf(email) };
    check(`${role}: invited with the role and joined`, invite.status === 201 && invite.body.role === role && joined.status === 200, `${invite.status}/${joined.status}`);
    const me = await api("GET", "/me", people[role].token);
    check(`${role}: /me carries role and permissions from the backend`, me.body.role === role && me.body.staff === true && Array.isArray(me.body.permissions) && me.body.permissions.length > 0, JSON.stringify(me.body));
  }
  people.OWNER = { email: env.STAFF_EMAIL, token: ownerToken };
});

// a ready reservation with one cash payment, to look at the payment panel
let reservation;
await run("fixture", async () => {
  const product = await productBySlug("tapis-de-sol");
  const view = await (await fetch(`${env.API}/api/v1/reservations`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ lines: [{ productId: product.id, quantity: 1, currency: "HTG" }], contact: { firstName: "Roles", lastName: "Check", dialCode: "+509", phone: `37${String(stamp).slice(-6)}` }, locale: "fr", acknowledgedTerms: true }) })).json();
  await admin("POST", `/admin/reservations/${view.id}/accept`, undefined, key());
  await admin("POST", `/admin/reservations/${view.id}/ready`, {}, key());
  const due = (await admin("GET", `/admin/reservations/${view.id}`)).body.balances[0].total;
  await admin("POST", `/admin/reservations/${view.id}/payments`, { amount: (Number(due) / 2).toFixed(2), currency: "HTG", method: "CASH_AT_PICKUP" }, key());
  reservation = view;
});

await run("api", async () => {
  section("1. The SERVER enforces each role (screens aside)");
  const statuses = async (role, calls) => { const out = []; for (const [m, p, b] of calls) out.push((await api(m, p, people[role].token, b)).status); return out; };
  const probe = [["GET", "/admin/reservations"], ["GET", "/admin/inventory"], ["GET", "/admin/customers"], ["GET", "/admin/notifications"], ["GET", "/admin/reports/overview"], ["GET", "/admin/products"], ["GET", "/admin/categories"], ["GET", "/admin/settings/pickup"], ["GET", "/admin/staff"], ["GET", "/admin/payments"]];
  const expected = { STAFF: [200, 200, 200, 200, 403, 403, 403, 403, 403, 403], MANAGER: [200, 200, 200, 200, 200, 200, 200, 403, 403, 200], OWNER: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200] };
  for (const role of ["STAFF", "MANAGER", "OWNER"]) {
    const got = await statuses(role, probe);
    check(`${role}: reservations/inventory/customers/messages/reports/products/categories/settings/team/payments answer ${expected[role].join(",")}`, JSON.stringify(got) === JSON.stringify(expected[role]), got.join(","));
  }
  const some = (await admin("GET", "/admin/inventory?size=1")).body.items[0];
  const adjust = (role) => api("POST", `/admin/inventory/${some.id}/adjustments`, people[role].token, { type: "ADD", quantity: 1, reason: "CORRECTION", note: "roles e2e" });
  check("STAFF cannot adjust stock (403); MANAGER can", (await adjust("STAFF")).status === 403 && (await adjust("MANAGER")).status === 201);
  const pay = await admin("GET", `/admin/reservations/${reservation.id}/payments`);
  const first = pay.body.payments[0];
  check("STAFF cannot reverse a payment (403)", (await api("POST", `/admin/payments/${first.id}/reversal`, people.STAFF.token, { reason: "roles e2e" })).status === 403);
  check("STAFF records a cash payment (counter work) but not above the balance (D3)", (await api("POST", `/admin/reservations/${reservation.id}/payments`, people.STAFF.token, { amount: "99999999.00", currency: "HTG", method: "CASH_AT_PICKUP" })).body?.code === "overpayment_not_allowed");
  check("a team member cannot change their OWN role and a MANAGER cannot invite", (await api("PUT", `/admin/staff/${(await api("GET", "/me", people.MANAGER.token)).body.userId}/role`, people.MANAGER.token, { role: "OWNER" })).status === 403 && (await api("POST", "/admin/staff/invitations", people.MANAGER.token, { note: "x", role: "OWNER" })).status === 403);
});

for (const [role, width] of [["STAFF", 1280], ["STAFF", 390], ["MANAGER", 1280], ["OWNER", 1280]]) {
  await run(`${role}@${width}`, async () => {
    section(`2. ${role} in the administration at ${width}px`);
    const { ctx, page } = await newPage(browser, { width });
    await signIn(page, people[role].email, role === "OWNER" ? env.STAFF_PASSWORD : PASSWORD);
    await openMenuIfMobile(page, width);
    const nav = await navText(page);
    const has = (label) => new RegExp(label).test(nav);
    const expectNav = {
      STAFF: { yes: ["Réservations", "Inventaire", "Clients", "Messages clients"], no: ["Produits", "Catégories", "Paiements", "Rapports", "Équipe", "Paramètres du magasin"] },
      MANAGER: { yes: ["Réservations", "Paiements", "Produits", "Catégories", "Inventaire", "Clients", "Rapports", "Messages clients"], no: ["Équipe", "Paramètres du magasin"] },
      OWNER: { yes: ["Réservations", "Paiements", "Produits", "Inventaire", "Rapports", "Messages clients", "Équipe", "Paramètres du magasin"], no: [] },
    }[role];
    check(`${role}@${width}: the menu offers exactly what the role may open`, expectNav.yes.every(has) && expectNav.no.every((l) => !has(l)), nav);
    if (width >= 1024 || role === "STAFF") await shot(page, `roles-${role.toLowerCase()}-menu-${width}`);
    if (width < 1024) await page.keyboard.press("Escape");
    await settle(page, 300);
    const dash = await bodyText(page);
    if (role === "STAFF") check("STAFF: the home is the counter queue, with no money figures", /À traiter au comptoir/.test(dash) && !/Montants reçus|Reçu|Produits les plus vendus/.test(dash), dash.slice(0, 120));
    else check(`${role}: the home is the full dashboard`, /Réservations ouvertes|Ouvertes/.test(dash) || /Reçu|Encaiss/.test(dash), dash.slice(0, 120));
    check(`${role}@${width}: no horizontal overflow on the home`, (await overflow(page)) <= 0, await overflow(page));
    await shot(page, `roles-${role.toLowerCase()}-home-${width}`);

    // a page the role may not open: an explanation, not a broken screen
    const forbiddenPage = { STAFF: "/fr/admin/reports", MANAGER: "/fr/admin/team", OWNER: null }[role];
    if (forbiddenPage) {
      await page.goto(`${env.WEB}${forbiddenPage}`); await settle(page, 1000);
      const t = await bodyText(page);
      check(`${role}@${width}: ${forbiddenPage} says it is not available with this role (no data, no error screen)`, /n'est pas disponible avec votre rôle/.test(t) && !/Erreur|Une erreur/.test(t.slice(0, 200)), t.slice(0, 120));
      await shot(page, `roles-${role.toLowerCase()}-noaccess-${width}`);
    }

    // the reservation with a payment: who sees which payment actions
    await page.goto(`${env.WEB}/fr/admin/reservations/${reservation.reference}`); await settle(page, 1500);
    const rt = await bodyText(page);
    check(`${role}@${width}: every role records a cash payment`, /Enregistrer le paiement/.test(rt));
    const canCorrect = role !== "STAFF";
    check(`${role}@${width}: reversing and adjusting payments is ${canCorrect ? "offered" : "not offered"}`, /Annuler le paiement/.test(rt) === canCorrect && /Ajuster le journal/.test(rt) === canCorrect);
    check(`${role}@${width}: no horizontal overflow on a reservation`, (await overflow(page)) <= 0, await overflow(page));
    await shot(page, `roles-${role.toLowerCase()}-reservation-${width}`);

    // stock: adjustments are for owner and manager
    await page.goto(`${env.WEB}/fr/admin/inventory`); await settle(page, 1500);
    const it = await bodyText(page);
    check(`${role}@${width}: stock is visible to all, stock adjustment only to Owner and Manager`, /Inventaire|Stock/.test(it) && (await page.getByRole("button", { name: "Ajuster" }).count() > 0) === (role !== "STAFF"));
    await ctx.close();
  });
}

await run("team", async () => {
  section("3. The owner sees and changes roles; the change applies on the very next request");
  const { ctx, page } = await newPage(browser, { width: 1280 });
  await signIn(page, env.STAFF_EMAIL, env.STAFF_PASSWORD);
  await page.goto(`${env.WEB}/fr/admin/team`); await settle(page, 1500);
  let t = await bodyText(page);
  check("the team list shows each member's role", /Responsable/.test(t) && /Équipe comptoir/.test(t) && /Propriétaire/.test(t));
  const counterRow = page.locator("li", { hasText: `STAFF e2e ${stamp}` }).filter({ has: page.getByRole("button", { name: "Changer le rôle" }) });
  await counterRow.getByRole("button", { name: "Changer le rôle" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Rôle").selectOption("MANAGER");
  check("the dialog explains what the chosen role may do", /Réservations, paiements/.test(await dialog.innerText()));
  await shot(page, "roles-owner-change-role-1280");
  await dialog.getByRole("button", { name: "Enregistrer le rôle" }).click();
  await page.getByText("Rôle modifié.").first().waitFor({ timeout: 10000 });
  const reports = await api("GET", "/admin/reports/overview", people.STAFF.token);
  check("the promoted member can read reports on their next request, without signing in again", reports.status === 200, String(reports.status));
  // back to counter staff
  await page.locator("li", { hasText: `STAFF e2e ${stamp}` }).getByRole("button", { name: "Changer le rôle" }).click();
  await page.getByRole("dialog").getByLabel("Rôle").selectOption("STAFF");
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer le rôle" }).click();
  await page.getByText("Rôle modifié.").first().waitFor({ timeout: 10000 });
  let lowered = 0;
  for (let i = 0; i < 20 && lowered !== 403; i++) { lowered = (await api("GET", "/admin/reports/overview", people.STAFF.token)).status; if (lowered !== 403) await new Promise((r) => setTimeout(r, 250)); }   // the earlier toast may still be showing: wait for the server's answer, not the toast
  check("and loses it again as soon as the role is lowered", lowered === 403, String(lowered));
  // the last owner cannot be demoted by anyone
  const me = await api("GET", "/me", ownerToken);
  const demote = await api("PUT", `/admin/staff/${me.body.userId}/role`, ownerToken, { role: "STAFF" });
  check("an owner cannot change their own role (refused)", demote.status >= 400, String(demote.status));
  await ctx.close();
});

check("no unexpected browser errors", pageErrors.filter((e) => !/403|Forbidden|Failed to load resource/.test(e)).length === 0, pageErrors.slice(0, 2).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
