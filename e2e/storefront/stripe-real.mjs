/**
 * Online payment — storefront + staff browser journeys against the REAL Spring Boot API and a LOCAL FAKE Stripe.
 *
 * LABEL: every result is REAL-LOCAL-FAKE-STRIPE. The API, PostgreSQL, Supabase Auth (local stack), webhooks, signature verification and the payment ledger are real.
 * "Stripe" is `ana-depot-api/dev/fake-stripe.mjs` (a script that signs webhooks with the configured secret and serves a fake hosted page). It is NOT Stripe: nothing here proves
 * anything about Stripe's real API, hosted page, currency support for the real merchant account, or real card payments.
 *
 * Needs: web build with NEXT_PUBLIC_CHECKOUT_TEST_ORIGIN=<fake stripe origin> (WEB_URL), the API (API_URL) with Stripe enabled against the fake, the fake (FAKE_STRIPE_URL),
 * a seeded catalog (product TAP-001 priced in HTG and USD) and the staff env of the other suites. Run on a SCRATCH database only.
 */
import { admin, bodyText, env, key, launch, newPage, overflow, pageErrors, publicApi, results, section, settle, shot, sleep, uniqPhone } from "./lib.mjs";

const FAKE = process.env.FAKE_STRIPE_URL ?? "http://127.0.0.1:9199";
const check = (name, ok, extra = "") => { results.push({ ok: !!ok, name }); console.log(`${ok ? "PASS" : "FAIL"}  [REAL-LOCAL-FAKE-STRIPE] ${name}${extra !== "" ? `  [${String(extra).replace(/\s+/g, " ").slice(0, 180)}]` : ""}`); };
const norm = (t) => t.replace(/[\u00a0\u202f]/g, " ");
const text = async (page) => norm(await bodyText(page));
const fakeJson = async (path, method = "GET") => (await fetch(`${FAKE}${path}`, { method })).json();
const sessions = () => fakeJson("/control/sessions");
const noCard = (page) => page.evaluate(() => !document.querySelector("iframe, input[autocomplete^='cc-'], input[name*='card' i], input[placeholder*='CVC' i], input[placeholder*='numéro de carte' i]"));

const browser = await launch();
const slug = "tapis-de-sol";
const product = await publicApi(`/products/${slug}`);
const productId = product.id;
const guest = (name) => ({ firstName: name, lastName: "Stripe", dialCode: "+509", phone: uniqPhone() });

async function reserveByApi(lines, who) {
  const r = await fetch(`${env.API}/api/v1/reservations`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ lines, contact: who, locale: "fr", acknowledgedTerms: true }) });
  const body = await r.json();
  if (r.status !== 201) throw new Error(`reserve failed ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}
async function makeReady(view) {
  const a = await admin("POST", `/admin/reservations/${view.id}/accept`, undefined, key());
  const r = await admin("POST", `/admin/reservations/${view.id}/ready`, {}, key());
  if (a.status >= 300 || r.status >= 300) throw new Error(`ready failed ${a.status}/${r.status}`);
}
const reservationOf = async (id) => (await admin("GET", `/admin/reservations/${id}`)).body;
const paymentsOf = async (id) => (await admin("GET", `/admin/reservations/${id}/payments`)).body;
const reconcile = async (id) => (await admin("GET", `/admin/reservations/${id}/reconciliation`)).body;
// reports are bucketed in the STORE's time zone (America/Port-au-Prince), not UTC: after 19:00 Haiti time the UTC date is already tomorrow
const netUsd = async () => { const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Port-au-Prince" }); const r = (await admin("GET", `/admin/reports/payments?from=${day}&to=${day}`)).body; return Number(r?.totals?.net?.USD ?? r?.totals?.USD?.net ?? 0); };
const usd = (id) => ({ productId: id, quantity: 1, currency: "USD" });
const htg = (id) => ({ productId: id, quantity: 1, currency: "HTG" });

/** Opens the tracking page as the guest (phone remembered in this tab) and presses the online button; returns the page on the fake hosted page. */
async function payOnline(page, view, phone) {
  await page.goto(`${env.WEB}/fr/reservations/${view.reference}`);
  await page.evaluate(([ref, ph]) => sessionStorage.setItem("ana.guest-access.v1", JSON.stringify({ [ref]: ph })), [view.reference, phone]);
  await page.goto(`${env.WEB}/fr/reservations/${view.reference}`);
  await page.getByRole("button", { name: /Payer en ligne —/ }).waitFor({ timeout: 15000 });
  await Promise.all([page.waitForURL(new RegExp(`^${FAKE.replace(/[.]/g, "\\.")}/pay/`), { timeout: 15000 }), page.getByRole("button", { name: /Payer en ligne —/ }).click()]);
}
const sessionIdOf = (url) => new URL(url).pathname.split("/").pop();

try {
  // ----------------------------------------------------------------------------------------------------------------------------------------
  section("1. Guest reserves by the real UI (HTG + USD lines), chooses pay at pickup: no card, no Stripe session");
  const who = { first: "Ana", last: "Stripe", phone: uniqPhone() };
  let mixed, mixedPhone = who.phone;
  {
    const { ctx, page } = await newPage(browser, { width: 1280 });
    const before = (await sessions()).length;
    const options = await publicApi("/store/payment-options");
    check("payment-options from the real API: online offered for USD only (the fake account cannot charge HTG)", options.online?.currencies?.length === 1 && options.online.currencies[0] === "USD", JSON.stringify(options));
    for (const cur of ["USD", "HTG"]) {
      await page.goto(`${env.WEB}/fr/products/${slug}`); await settle(page);
      await page.getByRole("button", { name: new RegExp(cur) }).click();
      await page.getByRole("button", { name: "Ajouter au panier" }).first().click(); await sleep(300);
    }
    await page.goto(`${env.WEB}/fr/reserve`); await settle(page);
    check("reserve page: no card fields", await noCard(page));
    await page.getByLabel("Prénom").fill(who.first); await page.getByLabel("Nom", { exact: true }).fill(who.last); await page.getByLabel("Téléphone").fill(who.phone);
    await page.getByRole("button", { name: "Continuer vers le retrait" }).click();
    await page.getByRole("button", { name: "Continuer vers la vérification" }).waitFor();
    check("pickup step: no card fields; pay-at-pickup wording", (await noCard(page)) && /sans payer maintenant, et sans carte/.test(await text(page)));
    await page.getByRole("button", { name: "Continuer vers la vérification" }).click();
    await page.getByRole("button", { name: /Envoyer la réservation/ }).waitFor();
    const review = await text(page);
    check("review step: 'Payer au retrait' with the online option only announced; no card fields", /Payer au retrait/.test(review) && /payer en ligne par carte \(Stripe\) une fois votre réservation prête/.test(review) && (await noCard(page)));
    await shot(page, "stripe-real-01-review-1280");
    await page.getByRole("checkbox", { name: /J'ai lu et je comprends/ }).check();
    await page.getByRole("button", { name: "Envoyer la réservation" }).click();
    await page.waitForURL(/reserve\/confirmation\/ANA-/, { timeout: 20000 }); await settle(page);
    const ref = page.url().match(/ANA-[A-Z0-9]{6}/)[0];
    const row = (await admin("GET", `/admin/reservations?q=${ref}`)).body.items[0];
    mixed = await reservationOf(row.id);
    check("reservation created through the real API, status pending review, one balance per currency", mixed.status === "PENDING_REVIEW" && mixed.balances.length === 2, mixed.balances.map((b) => `${b.currency} ${b.due}`).join(" / "));
    check("confirmation page: no online payment button yet (not ready), no card fields", (await page.getByRole("button", { name: /Payer en ligne —/ }).count()) === 0 && (await noCard(page)));
    check("no Stripe Checkout Session was created by reserving", (await sessions()).length === before);
    await shot(page, "stripe-real-02-confirmation-1280");
    await ctx.close();
  }

  // ----------------------------------------------------------------------------------------------------------------------------------------
  section("2. Reservation ready: guest pays the USD balance online (fake hosted page, signed webhook, ledger)");
  await makeReady(mixed);
  const usdBefore = await netUsd();
  let successSession;
  for (const width of [390, 1280]) {
    const { ctx, page } = await newPage(browser, { width });
    const reqs = [];
    page.on("request", (r) => { if (r.url().includes("/payments/checkout-session")) reqs.push({ body: r.postData(), headers: r.headers() }); });
    await page.goto(`${env.WEB}/fr/reservations/${mixed.reference}`);
    await page.evaluate(([ref, ph]) => sessionStorage.setItem("ana.guest-access.v1", JSON.stringify({ [ref]: ph })), [mixed.reference, mixedPhone]);
    await page.goto(`${env.WEB}/fr/reservations/${mixed.reference}`);
    await page.getByTestId("online-pay").waitFor({ timeout: 15000 });
    const t = await text(page);
    check(`${width}px: ready reservation shows ONE online button (USD, server amount) and HTG stays at-store`, (await page.getByRole("button", { name: /Payer en ligne —/ }).count()) === 1 && /Payer en ligne — 28,00 USD/.test(t) && /pas proposé pour HTG/.test(t));
    check(`${width}px: opening the page sent no session request`, reqs.length === 0);
    check(`${width}px: no card fields`, await noCard(page));
    await shot(page, `stripe-real-03-track-${width}`);
    if (width === 1280) {
      await Promise.all([page.waitForURL(new RegExp(`^${FAKE.replace(/[.]/g, "\\.")}/pay/cs_test_`), { timeout: 15000 }), page.getByRole("button", { name: /Payer en ligne —/ }).click()]);
      successSession = sessionIdOf(page.url());
      const s = (await sessions()).find((x) => x.id === successSession);
      check("redirected to the hosted page URL returned by the backend (fake origin)", page.url().startsWith(`${FAKE}/pay/cs_test_`));
      check("request carried only phone + currency and an Idempotency-Key (no amount)", reqs.length === 1 && JSON.stringify(Object.keys(JSON.parse(reqs[0].body)).sort()) === JSON.stringify(["currency", "phone"]) && !!reqs[0].headers["idempotency-key"], reqs[0]?.body);
      check("the backend created the session with the server-calculated amount, one currency (28.00 USD)", s?.amount_total === 2800 && s?.currency === "usd", s ? `${s.amount_total} ${s.currency}` : "no session");
      check("session success/cancel URLs point at the web origin and the locale", String(s?.success_url).startsWith(`${env.WEB}/fr/payment/return?reference=${mixed.reference}`) && String(s?.cancel_url).startsWith(`${env.WEB}/fr/payment/cancelled?reference=${mixed.reference}`), `${s?.success_url}`);
      const midway = (await paymentsOf(mixed.id));
      check("a Checkout Session alone is not a payment: nothing on the ledger yet", midway.payments.length === 0 && midway.paymentStatus === "UNPAID");
      await page.getByRole("button", { name: /Pay \(success\)/ }).click();
      await page.waitForURL(/\/fr\/payment\/return\?reference=/, { timeout: 15000 });
      await page.getByRole("heading", { name: "Paiement confirmé" }).waitFor({ timeout: 30000 });
      const done = await text(page);
      check("return page: confirmed, 28,00 USD received (from the backend), HTG still shown as remaining", /Nous avons bien reçu 28,00 USD/.test(done) && /Reste à payer/.test(done) && /3 500,00 HTG/.test(done) && !/entièrement payée/.test(done));
      check("return page: no card fields, no overflow", (await noCard(page)) && (await overflow(page)) <= 0);
      await shot(page, "stripe-real-04-return-success-1280");
    }
    await ctx.close();
  }
  {
    const p = await paymentsOf(mixed.id);
    const stripePays = p.payments.filter((x) => x.method === "STRIPE_CHECKOUT");
    check("ledger: exactly one STRIPE_CHECKOUT payment of 28.00 USD with the PaymentIntent reference", stripePays.length === 1 && stripePays[0].amount === "28.00" && stripePays[0].currency === "USD" && /^pi_/.test(stripePays[0].reference ?? ""), JSON.stringify(stripePays.map((x) => [x.amount, x.currency, x.reference])));
    check("reservation is PARTIAL (USD settled, HTG still due): never marked fully paid", p.paymentStatus === "PARTIAL" && p.balances.find((b) => b.currency === "HTG").due === "3500.00" && p.balances.find((b) => b.currency === "USD").due === "0.00");
    await fakeJson(`/control/replay/${successSession}`, "POST");
    await sleep(1500);
    const again = await paymentsOf(mixed.id);
    check("duplicate webhook delivery (replay): still exactly one payment", again.payments.filter((x) => x.method === "STRIPE_CHECKOUT").length === 1 && (await admin("GET", `/admin/reservations/${mixed.id}/ledger`)).body.filter((e) => e.type === "PAYMENT_RECEIVED").length === 1);
    check("reconciliation is consistent", (await reconcile(mixed.id)).consistent === true);
    check("reports: payments received moved by exactly the settled 28.00 USD (not by session creation)", Math.round((await netUsd() - usdBefore) * 100) === 2800, `${usdBefore} -> ${await netUsd()}`);
  }

  // ----------------------------------------------------------------------------------------------------------------------------------------
  section("3. Abandoned, expired and failed payments never delete or pay the reservation");
  {
    const w = guest("Abandon"); const v = await reserveByApi([usd(productId)], w); await makeReady(v);
    const usdBase = await netUsd();
    const { ctx, page } = await newPage(browser, { width: 390 });
    await payOnline(page, v, w.phone);
    const sid1 = sessionIdOf(page.url());
    await page.getByRole("button", { name: /Back to Ana Dépôt/ }).click();
    await page.waitForURL(/\/fr\/payment\/cancelled/, { timeout: 15000 });
    await page.getByRole("heading", { name: "Paiement non terminé" }).waitFor();
    const t = await page.locator("main").innerText().then(norm);
    check("abandon: 'Paiement non terminé / Votre réservation est conservée', no cancellation or refund claim", /Votre réservation est conservée/.test(t) && !/annulée|remboursé|remboursement|confirmé/i.test(t));
    await shot(page, "stripe-real-05-cancelled-390");
    const r = await reservationOf(v.id);
    check("abandon: reservation still READY and unpaid; nothing posted; report unchanged", r.status === "READY_FOR_PICKUP" && r.paymentStatus === "UNPAID" && (await paymentsOf(v.id)).payments.length === 0 && (await netUsd()) === usdBase);
    await page.getByRole("link", { name: "Revenir à ma réservation" }).click();
    await page.waitForURL(new RegExp(`/fr/reservations/${v.reference}`));
    await page.getByRole("button", { name: /Payer en ligne —/ }).waitFor();
    await Promise.all([page.waitForURL(new RegExp(`^${FAKE.replace(/[.]/g, "\\.")}/pay/`), { timeout: 15000 }), page.getByRole("button", { name: /Payer en ligne —/ }).click()]);
    const sid2 = sessionIdOf(page.url());
    check("after abandoning, the customer can come back and start online payment again (open session reused, or a new one)", !!sid2, `${sid1 === sid2 ? "same session reused" : "new session"}`);
    // the customer lets the session expire
    await page.getByRole("button", { name: /Let the session expire/ }).click();
    await page.waitForURL(/\/fr\/payment\/cancelled/, { timeout: 15000 });
    await sleep(500);
    const status = await (await fetch(`${env.API}/api/v1/reservations/${v.reference}/payments/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: w.phone }) })).json();
    check("expired session: attempt EXPIRED in the backend, reservation intact and unpaid", status.attempts.some((a) => a.status === "EXPIRED") && status.reservation.paymentStatus === "UNPAID" && status.reservation.status === "READY_FOR_PICKUP", JSON.stringify(status.attempts.map((a) => a.status)));
    await page.goto(`${env.WEB}/fr/reservations/${v.reference}`);
    await Promise.all([page.waitForURL(new RegExp(`^${FAKE.replace(/[.]/g, "\\.")}/pay/`), { timeout: 15000 }), page.getByRole("button", { name: /Payer en ligne —/ }).click()]);
    const sid3 = sessionIdOf(page.url());
    check("after expiry a NEW session can be created", sid3 !== sid2, `${sid2} -> ${sid3}`);
    await ctx.close();
  }
  {
    const w = guest("Echec"); const v = await reserveByApi([usd(productId)], w); await makeReady(v);
    const { ctx, page } = await newPage(browser, { width: 390 });
    await payOnline(page, v, w.phone);
    await page.getByRole("button", { name: /Pay \(payment fails\)/ }).click();
    await page.waitForURL(/\/fr\/payment\/cancelled/, { timeout: 15000 });
    const r = await reservationOf(v.id);
    check("failed payment: reservation not paid, still READY, nothing on the ledger", r.paymentStatus === "UNPAID" && r.status === "READY_FOR_PICKUP" && (await paymentsOf(v.id)).payments.length === 0);
    const att = (await admin("GET", `/admin/payment-attempts?reservationId=${v.id}`)).body.items;
    check("failed payment: staff API shows the attempt with its failure code", att.length === 1 && !!att[0].failureCode, JSON.stringify(att.map((a) => [a.status, a.failureCode])));
    await ctx.close();
  }

  // ----------------------------------------------------------------------------------------------------------------------------------------
  section("4. Delayed payment method: processing, then settled by the signed async webhook");
  {
    const w = guest("Delai"); const v = await reserveByApi([usd(productId)], w); await makeReady(v);
    const { ctx, page } = await newPage(browser, { width: 390 });
    await payOnline(page, v, w.phone);
    const sid = sessionIdOf(page.url());
    await page.getByRole("button", { name: /delayed method/ }).click();
    await page.waitForURL(/\/fr\/payment\/return/, { timeout: 15000 });
    await page.getByRole("heading", { name: "Paiement en cours de traitement" }).waitFor({ timeout: 20000 });
    const t = await text(page);
    check("delayed method: shown as processing, NOT confirmed; reservation unpaid in the backend", !/Paiement confirmé/.test(t) && (await reservationOf(v.id)).paymentStatus === "UNPAID");
    await shot(page, "stripe-real-06-return-processing-390");
    await fetch(`${FAKE}/pay/${sid}/settle`, { method: "POST", redirect: "manual" });
    await page.getByRole("heading", { name: "Paiement confirmé" }).waitFor({ timeout: 40000 });
    check("after the async success webhook the page turns confirmed on its own (polling)", true);
    check("delayed method: one payment, reservation PAID", (await paymentsOf(v.id)).payments.length === 1 && (await reservationOf(v.id)).paymentStatus === "PAID");
    await ctx.close();
  }

  // ----------------------------------------------------------------------------------------------------------------------------------------
  section("5. HTG is never charged: not offered, refused by the API, pay-at-pickup remains");
  {
    const w = guest("Gourde"); const v = await reserveByApi([htg(productId)], w); await makeReady(v);
    const { ctx, page } = await newPage(browser, { width: 390 });
    const before = (await sessions()).length;
    await page.goto(`${env.WEB}/fr/reservations/${v.reference}`);
    await page.evaluate(([ref, ph]) => sessionStorage.setItem("ana.guest-access.v1", JSON.stringify({ [ref]: ph })), [v.reference, w.phone]);
    await page.goto(`${env.WEB}/fr/reservations/${v.reference}`); await settle(page);
    const t = await text(page);
    check("HTG-only reservation: no online button, explanation + pay at the store, no conversion wording", (await page.getByRole("button", { name: /Payer en ligne —/ }).count()) === 0 && /pas proposé pour HTG/.test(t) && !/convers|taux de change/i.test(t));
    await shot(page, "stripe-real-07-htg-390");
    const direct = await fetch(`${env.API}/api/v1/reservations/${v.reference}/payments/checkout-session`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ currency: "HTG", phone: w.phone }) });
    const body = await direct.json();
    check("the API itself refuses an HTG session (422 currency_not_available_online); no session created, no silent USD", direct.status === 422 && body.code === "currency_not_available_online" && (await sessions()).length === before, `${direct.status} ${body.code}`);
    await ctx.close();
  }

  // ----------------------------------------------------------------------------------------------------------------------------------------
  section("6. Staff screens: Stripe vs cash, attempts, no reversal of a Stripe payment");
  {
    // cash on the mixed reservation's remaining HTG balance, recorded the existing way
    await admin("POST", `/admin/reservations/${mixed.id}/payments`, { amount: "3500.00", currency: "HTG", method: "CASH_AT_PICKUP" }, key());
    for (const width of [1280, 390]) {
      const { ctx, page } = await newPage(browser, { width });
      await page.goto(`${env.WEB}/fr/auth/login?next=%2Fadmin`); await settle(page);
      await page.getByLabel("E-mail").fill(env.STAFF_EMAIL); await page.getByLabel("Mot de passe", { exact: true }).fill(env.STAFF_PASSWORD);
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
      await page.waitForURL(/\/fr\/admin/, { timeout: 20000 }); await settle(page);
      await page.goto(`${env.WEB}/fr/admin/reservations/${mixed.reference}`); await settle(page, 1200);
      let t = await text(page);
      check(`${width}px: reservation payment panel shows both methods as separate badges`, /Stripe/.test(t) && /Espèces/.test(t));
      check(`${width}px: the Stripe payment shows its PaymentIntent reference and the no-reversal explanation`, /Identifiant PaymentIntent Stripe pi_/.test(t) && /ne peut pas être annulé depuis cet écran/.test(t));
      const rows = page.locator("li").filter({ hasText: /Identifiant PaymentIntent Stripe|Espèces/ });
      const stripeRow = rows.filter({ hasText: "Identifiant PaymentIntent Stripe" }).first();
      const cashRow = page.locator("li").filter({ hasText: "Espèces" }).filter({ hasNot: page.getByText("Identifiant PaymentIntent Stripe") }).first();
      check(`${width}px: no reverse action on the Stripe payment, while the cash payment keeps its own`, (await stripeRow.getByRole("button").count()) === 0 && (await cashRow.getByRole("button").count()) >= 1);
      check(`${width}px: tentatives en ligne section lists the attempt (confirmed)`, /Tentatives de paiement en ligne/.test(t) && /Confirmé/.test(t));
      await shot(page, `stripe-real-08-admin-reservation-${width}`);
      await page.goto(`${env.WEB}/fr/admin/payments?method=STRIPE_CHECKOUT`); await settle(page, 1200);
      t = await text(page);
      const stripeRows = (await page.locator("tbody tr").allInnerTexts()).map(norm);
      check(`${width}px: payments list filtered by Stripe shows only Stripe payments (badge + pi_ reference)`, stripeRows.length >= 1 && stripeRows.every((r) => /Stripe/.test(r) && /pi_/.test(r) && !/Espèces/.test(r)), `${stripeRows.length} rows`);
      await shot(page, `stripe-real-09-admin-payments-stripe-${width}`);
      await page.goto(`${env.WEB}/fr/admin/payments?method=CASH_AT_PICKUP`); await settle(page, 1200);
      const cashRows = (await page.locator("tbody tr").allInnerTexts()).map(norm);
      check(`${width}px: payments list filtered by cash shows only cash payments`, cashRows.length >= 1 && cashRows.every((r) => /Espèces/.test(r) && !/pi_/.test(r)), `${cashRows.length} rows`);
      await page.goto(`${env.WEB}/fr/admin/payments?view=attempts`); await settle(page, 1200);
      t = await text(page);
      check(`${width}px: attempts view lists attempts with status chips (Confirmé, Expiré, En attente…)`, /Confirmé/.test(t) && /Expiré|En attente/.test(t));
      const refs = await page.locator(width < 768 ? "ul.md\\:hidden li" : "tbody tr th").allInnerTexts();
      check(`${width}px: every attempt names its reservation reference`, refs.length > 0 && refs.every((r) => /ANA-[A-Z2-9]{6}/.test(r)), `${refs.length} rows`);
      check(`${width}px: no horizontal page overflow in the staff pages`, (await overflow(page)) <= 0, await overflow(page));
      await shot(page, `stripe-real-10-admin-attempts-${width}`);
      await ctx.close();
    }
    // reversal of the Stripe payment is refused by the backend, and no refund endpoint exists
    const pay = (await paymentsOf(mixed.id)).payments.find((p) => p.method === "STRIPE_CHECKOUT");
    const rev = await admin("POST", `/admin/payments/${pay.id}/reversal`, { reason: "test" }, key());
    check("the backend refuses to reverse a Stripe payment (online_payment_reversal_unsupported)", rev.status === 409 && rev.body?.code === "online_payment_reversal_unsupported", `${rev.status} ${rev.body?.code}`);
    const manual = await admin("POST", `/admin/reservations/${mixed.id}/payments`, { amount: "1.00", currency: "USD", method: "STRIPE_CHECKOUT" }, key());
    check("staff cannot record a Stripe payment by hand (refused)", manual.status >= 400, `${manual.status} ${manual.body?.code}`);
  }
} catch (e) {
  console.log(`FATAL ${e.stack ?? e}`);
  results.push({ ok: false, name: `fatal: ${e.message}` });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed  (REAL-LOCAL-FAKE-STRIPE: real API + local fake Stripe; NOT real Stripe)`);
if (pageErrors.length) console.log(`page errors (${pageErrors.length}):\n${pageErrors.slice(0, 12).join("\n")}`);
process.exit(failed.length ? 1 : 0);
