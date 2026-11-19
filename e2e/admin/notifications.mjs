/**
 * CUSTOMER E-MAIL browser suite — LOCAL STACK, REAL SMTP: the API runs with ANA_MAIL_MODE=smtp pointing at a local Mailpit (a mail catcher: it accepts the message over real SMTP and shows it over HTTP),
 * with short retry timings (ANA_MAIL_MAX_ATTEMPTS=3, ANA_MAIL_INITIAL_BACKOFF=PT3S, ANA_MAIL_POLL_INTERVAL=PT2S). Not a test of a hosted SMTP provider or of deliverability.
 *
 *   NOTIF_MAIL_API_URL=http://127.0.0.1:54326   Mailpit's HTTP API (explicit, local)
 *   NOTIF_MAIL_CONTAINER=ana-mailpit            the Mailpit container name: the outage test STOPS and STARTS it (docker CLI)
 * Same setup as e2e/storefront/README.md otherwise. Run: `npm run e2e:notifications`.
 */
import { execSync } from "node:child_process";
import { assertLocalUrls } from "../../scripts/e2e-target-guard.mjs";
import { admin, bodyText, check, env, key, launch, newPage, overflow, pageErrors, publicApi, results, section, settle, shot, sleep, uniqPhone } from "../storefront/lib.mjs";

assertLocalUrls(process.env, ["NOTIF_MAIL_API_URL"]);
const MAIL = process.env.NOTIF_MAIL_API_URL;
const CONTAINER = process.env.NOTIF_MAIL_CONTAINER;
if (!CONTAINER) { console.error("Set NOTIF_MAIL_CONTAINER (the local Mailpit container name)."); process.exit(2); }

const mailJson = async (path, init) => (await fetch(`${MAIL}${path}`, init)).json();
const clearMail = () => fetch(`${MAIL}/api/v1/messages`, { method: "DELETE" });
async function mailsTo(address) { const list = (await mailJson("/api/v1/messages?limit=200")).messages ?? []; return list.filter((m) => (m.To ?? []).some((t) => t.Address === address)); }
async function waitForMail(address, subjectPart, ms = 40000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const hit = (await mailsTo(address)).find((m) => (m.Subject ?? "").includes(subjectPart));
    if (hit) return mailJson(`/api/v1/message/${hit.ID}`);
    await sleep(1000);
  }
  return null;
}
const docker = (cmd) => execSync(`docker ${cmd} ${CONTAINER}`, { stdio: "ignore" });
const norm = (t) => t.replace(/[  ]/g, " ");

const browser = await launch();
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script`, false, `${String(e.message).split("\n")[0]} @ ${(String(e.stack).match(/notifications\.mjs:(\d+)/) ?? [])[1] ?? "?"}`); } };
const stamp = Date.now();
const guest = `guest-${stamp}@example.test`;
const products = (await publicApi("/products?size=40")).items ?? [];
const plain = products.find((p) => !(p.variants ?? []).length && (p.availableQuantity ?? 1) > 0 && (p.prices ?? []).some((x) => x.currency === "HTG"));
if (!plain) { console.error("seed the catalog first (e2e/storefront/seed.py)"); process.exit(2); }

async function reserveThroughTheUi(email, lang = "fr") {
  const { ctx, page } = await newPage(browser, { serviceWorkers: "block" });
  await page.goto(`${env.WEB}/fr/products/${plain.slug}`); await settle(page, 800);
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click(); await sleep(300);
  await page.goto(`${env.WEB}/fr/reserve`); await settle(page, 800);
  await page.getByLabel("Prénom").fill("Évelyne"); await page.getByLabel("Nom", { exact: true }).fill("Test");
  await page.getByLabel("Téléphone").fill(uniqPhone()); await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Continuer vers le retrait" }).click();
  await page.getByRole("button", { name: "Continuer vers la vérification" }).waitFor(); await page.getByRole("button", { name: "Continuer vers la vérification" }).click();
  await page.getByRole("checkbox", { name: /J'ai lu et je comprends/ }).check();
  await page.getByRole("button", { name: /Envoyer la réservation/ }).click();
  await page.waitForURL(/\/reserve\/confirmation\//, { timeout: 30000 });
  const ref = decodeURIComponent(page.url().split("/").pop());
  await ctx.close();
  return ref;
}
const detailOf = async (ref) => { const l = (await admin("GET", `/admin/reservations?q=${ref}`)).body.items.find((x) => x.reference === ref); return (await admin("GET", `/admin/reservations/${l.id}`)).body; };

let ref = null;
await run("delivery", async () => {
  section("A. A guest reserves in the browser; every business event reaches a real mail server");
  await clearMail();
  ref = await reserveThroughTheUi(guest);
  const submitted = await waitForMail(guest, ref);
  check("the reservation e-mail arrives over real SMTP", !!submitted, ref);
  if (!submitted) return;
  check("subject names the reference", submitted.Subject === `Réservation ${ref} reçue`, submitted.Subject);
  check("sent from the configured sender, addressed to the customer only", /no-reply@ana-depot\.test/.test(JSON.stringify(submitted.From)) && submitted.To.length === 1 && submitted.To[0].Address === guest);
  check("both a plain-text and an HTML part exist (UTF-8)", (submitted.Text ?? "").length > 80 && (submitted.HTML ?? "").includes("<!DOCTYPE html>") && /Évelyne/.test(submitted.Text));
  const text = norm(submitted.Text);
  check("it shows the reference, the line, the HTG total, the pickup as snapshotted and how to track", text.includes(ref) && /HTG/.test(text) && /Magasin de vérification/.test(text) && /Suivre ma réservation/.test(text), text.slice(0, 120));
  check("it contains no phone number of the customer and no internal text", !/\+509 ?3\d{6}/.test(text) && !/interne|internal|staff/i.test(text));

  const d = await detailOf(ref);
  const post = (path, body, extra) => admin("POST", `/admin/reservations/${d.id}${path}`, body, extra);
  check("staff accept", (await post("/accept", {})).status < 300);
  const confirmed = await waitForMail(guest, "acceptée");
  check("accepted e-mail arrives", !!confirmed && norm(confirmed.Text).includes(ref));
  check("staff mark ready", (await post("/ready", {})).status < 300);
  const ready = await waitForMail(guest, "prête à retirer");
  check("ready e-mail arrives with the pickup address, hours and the amount still due", !!ready && /Port-au-Prince|Essai/.test(norm(ready.Text)) && /Reste à payer/.test(norm(ready.Text)) && /Lundi/.test(norm(ready.Text)));
  const due = (await detailOf(ref)).balances?.find((b) => b.currency === "HTG")?.due ?? (await detailOf(ref)).totals?.find((t) => t.currency === "HTG")?.amount;
  check("staff record cash", (await post("/payments", { amount: due, currency: "HTG" }, key())).status < 300);
  const receipt = await waitForMail(guest, "Paiement reçu");
  check("the receipt says the payment was at the store (cash) and settles HTG", !!receipt && /Espèces au magasin/.test(norm(receipt.Text)) && /Réglé/.test(norm(receipt.Text)) && !/Carte en ligne/.test(norm(receipt.Text)));
  check("staff collect", (await post("/collect", {})).status < 300);
  check("collected e-mail arrives", !!(await waitForMail(guest, "retirée")));
  const count = (await mailsTo(guest)).filter((m) => m.Subject.includes(ref)).length;
  check("exactly five messages for this reservation (received, accepted, ready, receipt, collected): no duplicates", count === 5, String(count));
});

await run("creole", async () => {
  section("B. Haitian Creole reservation");
  const email = `ht-${stamp}@example.test`;
  const res = await fetch(`${env.API}/api/v1/reservations`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ lines: [{ productId: plain.id, quantity: 1, currency: "HTG" }], contact: { firstName: "Jean", lastName: "Baptiste", dialCode: "+509", phone: uniqPhone(), email }, locale: "ht", acknowledgedTerms: true }) });
  const created = await res.json();
  const m = await waitForMail(email, created.reference);
  check("the Haitian Creole e-mail arrives in Haitian Creole", !!m && m.Subject === `Rezèvasyon ${created.reference} resevwa` && /Bonjou Jean/.test(m.Text) && !/Bonjour/.test(m.Text), m?.Subject);
  if (m) {
    const { ctx, page } = await newPage(browser, { width: 390, height: 900 });
    await page.setContent(m.HTML);
    check("the HTML message does not scroll sideways on a phone", (await overflow(page)) <= 0, String(await overflow(page)));
    await shot(page, "email-ht-390");
    await page.setViewportSize({ width: 700, height: 900 }); await shot(page, "email-ht-700");
    await ctx.close();
  }
});

await run("screens", async () => {
  section("C. Staff see the messages: reservation page, Messages screen, summary");
  const { ctx, page } = await newPage(browser);
  await page.goto(`${env.WEB}/fr/auth/login?next=%2Fadmin%2Fnotifications`); await settle(page);
  await page.getByLabel("E-mail").fill(env.STAFF_EMAIL); await page.getByLabel("Mot de passe", { exact: true }).fill(env.STAFF_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/admin\/notifications/, { timeout: 20000 }); await settle(page, 1500);
  let t = norm(await bodyText(page));
  check("the Messages screen lists the customer's messages with a MASKED recipient and no address", /Messages clients/.test(t) && /Réservation reçue/.test(t) && /g\*\*\*@example\.test/.test(t) && !t.includes(guest), t.slice(0, 120));
  check("real sending is active (no development banner)", !/Mode développement|désactivé/.test(t));
  check("sent messages are shown as sent", /Envoyé/.test(t));
  await shot(page, "notifications-d");
  await page.goto(`${env.WEB}/fr/admin/reservations/${ref}`); await settle(page, 1500);
  t = norm(await bodyText(page));
  check("the reservation page shows what the customer was told", /Messages envoyés au client/.test(t) && /Paiement reçu/.test(t) && /Retrait enregistré/.test(t));
  await page.goto(`${env.WEB}/ht/admin/notifications`); await settle(page, 1500);
  check("the Messages screen exists in Haitian Creole", /Mesaj kliyan yo/.test(await bodyText(page)));
  const m = await newPage(browser, { width: 390, height: 844 });
  await m.page.goto(`${env.WEB}/fr/auth/login?next=%2Fadmin%2Fnotifications`); await settle(m.page);
  await m.page.getByLabel("E-mail").fill(env.STAFF_EMAIL); await m.page.getByLabel("Mot de passe", { exact: true }).fill(env.STAFF_PASSWORD);
  await m.page.getByRole("button", { name: "Se connecter", exact: true }).click(); await m.page.waitForURL(/\/admin\/notifications/, { timeout: 20000 }); await settle(m.page, 1500);
  check("no horizontal scroll at 390 px", (await overflow(m.page)) <= 0, String(await overflow(m.page)));
  await shot(m.page, "notifications-m");
  await m.ctx.close(); await ctx.close();
});

await run("outage", async () => {
  section("D. The mail server goes down: messages wait, retry with backoff, give up visibly, and staff can resend");
  const email = `outage-${stamp}@example.test`;
  docker("stop");
  let reference;
  try {
    const res = await fetch(`${env.API}/api/v1/reservations`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ lines: [{ productId: plain.id, quantity: 1, currency: "HTG" }], contact: { firstName: "Marc", lastName: "Panne", dialCode: "+509", phone: uniqPhone(), email }, locale: "fr", acknowledgedTerms: true }) });
    check("the reservation itself succeeds while the mail server is down (email never blocks the business operation)", res.status === 201, String(res.status));
    reference = (await res.json()).reference;
    // wait until the three attempts are used up (3 s backoff, doubling, jittered, polled every 2 s)
    let n = null;
    for (let i = 0; i < 60 && !(n?.status === "DEAD"); i++) { await sleep(1500); n = ((await admin("GET", `/admin/notifications?reservationId=${(await detailOf(reference)).id}`)).body?.items ?? [])[0]; }
    check("after bounded retries the message is DEAD with a short code (visible, not lost)", n?.status === "DEAD" && n.attempts === 3 && /smtp_(unavailable|timeout)/.test(n.lastError ?? ""), JSON.stringify(n ?? {}).slice(0, 140));
    check("the API never exposes the address or any server detail", !JSON.stringify(n).includes(email) && !/127\.0\.0\.1|54325/.test(JSON.stringify(n)));
  } finally { docker("start"); await sleep(4000); }

  const { ctx, page } = await newPage(browser);
  await page.goto(`${env.WEB}/fr/auth/login?next=%2Fadmin`); await settle(page);
  await page.getByLabel("E-mail").fill(env.STAFF_EMAIL); await page.getByLabel("Mot de passe", { exact: true }).fill(env.STAFF_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click(); await page.waitForURL(/\/admin/, { timeout: 20000 }); await settle(page, 1500);
  check("the dashboard warns that customer messages failed", /message\(s\) client n'ont pas pu être envoyés/.test(norm(await bodyText(page))));
  await page.goto(`${env.WEB}/fr/admin/notifications?status=DEAD`); await settle(page, 1500);
  const t = norm(await bodyText(page));
  check("the Messages screen shows the failure in plain words with a Resend button", /Échec définitif/.test(t) && /Serveur d'e-mail injoignable|n'a pas répondu à temps/.test(t));
  await shot(page, "notifications-dead-d");
  const row = page.locator("li", { hasText: /o\*\*\*@example\.test/ }).filter({ has: page.getByRole("button", { name: "Renvoyer" }) }).first();   // "outage-…@example.test" is masked as o***@example.test
  await row.getByRole("button", { name: "Renvoyer" }).click();
  const dialog = page.getByRole("dialog");
  check("resending asks for confirmation and promises a single, still-true message", /une seule fois/.test(await dialog.innerText()));
  await dialog.getByRole("button", { name: "Renvoyer" }).click();
  await page.getByText("Message remis en file d'envoi.").first().waitFor({ timeout: 10000 });
  const delivered = await waitForMail(email, reference, 40000);
  check("the resent message is delivered once the mail server is back", !!delivered);
  check("exactly one copy was delivered", (await mailsTo(email)).filter((m) => m.Subject.includes(reference)).length === 1);
  await ctx.close();
});

await run("auth-emails", async () => {
  section("E. This application never duplicates Supabase's authentication e-mails");
  const before = (await mailJson("/api/v1/messages?limit=200")).messages?.length ?? 0;
  const SK = process.env.SUPABASE_LOCAL_SECRET_KEY;
  if (SK) {
    const email = `auth-${stamp}@example.test`;
    await fetch(`${env.SB}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Str0ng-pass-1", email_confirm: true }) });
    await sleep(6000);
  }
  const after = (await mailJson("/api/v1/messages?limit=200")).messages ?? [];
  check("creating an account through Supabase produces no message from the application's SMTP sender", after.length === before && !after.some((m) => /vérif|verif|mot de passe|password|bienvenue|welcome/i.test(m.Subject ?? "")), `${before} -> ${after.length}`);
  check("every message this application sent is one of its reservation or payment messages", after.every((m) => /Réservation|Rezèvasyon|Paiement|Peman|Session|Sesyon/.test(m.Subject ?? "")));
});

check("no browser errors during the run", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
