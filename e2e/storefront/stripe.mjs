/**
 * Online payment (hosted Stripe Checkout) — storefront browser checks.
 *
 * LABEL: every result here is MOCKED. The API and Stripe are replaced by Playwright route handlers (`page.route`), so this proves the web side
 * (what is shown, what is requested, where the browser is sent, that success is never assumed) and NOTHING about the real backend, the real Stripe API
 * or a real Stripe payment. The "REAL-LOCAL-FAKE-STRIPE" journeys (real API + a local fake Stripe) live in `stripe-real.mjs` once that stack exists.
 *
 * Needs only a running web build (WEB_URL, default http://127.0.0.1:3105). No credentials.
 */
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://127.0.0.1:3105";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/storefront/screenshots";
fs.mkdirSync(SHOTS, { recursive: true });
const REF = "ANA-K7M2QX", PHONE = "34567890";

const results = [];
const check = (name, ok, extra = "") => { results.push({ ok: !!ok, name }); console.log(`${ok ? "PASS" : "FAIL"}  [MOCKED] ${name}${extra !== "" ? `  [${String(extra).replace(/\s+/g, " ").slice(0, 160)}]` : ""}`); };
const section = (t) => console.log(`\n== ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page) => page.locator("body").innerText().then((t) => t.replace(/[\u00a0\u202f]/g, " "));

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = `${os.homedir()}/.cache/ms-playwright`;
  return `${base}/${fs.readdirSync(base).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
const fulfil = (route, status, body) => route.fulfill({ status, headers: { ...CORS, "content-type": status >= 400 ? "application/problem+json" : "application/json" }, body: JSON.stringify(body) });

const line = (currency, total) => ({ productId: "p1", variantId: null, name: "Article d'essai", sku: "X", variantLabel: null, unit: "UNIT", quantity: 1, currency, unitPrice: total, pricingKind: "RETAIL", tierMinQuantity: null, lineTotal: total });
/** A reservation view as the API's lookup would return it (fixture, not real data). */
const reservation = ({ status = "READY_FOR_PICKUP", usdDue = "18.50", htgDue = "1500.00" } = {}) => ({
  id: "res-1", reference: REF, status, paymentStatus: usdDue === "0.00" && htgDue === "0.00" ? "PAID" : "UNPAID", locale: "fr", createdAt: "2026-11-17T09:00:00Z", readyAt: null, expiresAt: null,
  contact: { firstName: "Test", lastName: "Client", dialCode: "+509", phone: PHONE, email: null },
  lines: [line("HTG", "1500.00"), line("USD", "18.50")], totals: [{ currency: "HTG", amount: "1500.00" }, { currency: "USD", amount: "18.50" }],
  balances: [{ currency: "HTG", total: "1500.00", paid: "0.00", due: htgDue }, { currency: "USD", total: "18.50", paid: usdDue === "0.00" ? "18.50" : "0.00", due: usdDue }],
  pickup: null, canCancel: false, events: [{ type: "SUBMITTED", at: "2026-11-17T09:00:00Z", note: null, rejectReason: null, cancelledBy: null }],
});
const attempt = (status, over = {}) => ({ id: "att-1", currency: "USD", amount: "18.50", status, settledAt: status === "SUCCEEDED" ? "2026-11-17T10:00:00Z" : null, createdAt: "2026-11-17T09:58:00Z", ...over });
const statusBody = (att, over = {}) => ({ reservation: { reference: REF, status: "READY_FOR_PICKUP", paymentStatus: att?.status === "SUCCEEDED" ? "PARTIAL" : "UNPAID", balances: [{ currency: "HTG", total: "1500.00", paid: "0.00", due: "1500.00" }, { currency: "USD", total: "18.50", paid: att?.status === "SUCCEEDED" ? "18.50" : "0.00", due: att?.status === "SUCCEEDED" ? "0.00" : "18.50" }] }, attempt: att, attempts: att ? [att] : [], ...over });

/** Installs the mocked API on a page. `state` is mutable so a test can change the answers between requests. */
async function mockApi(page, state) {
  state.calls = { options: 0, session: [], status: [], lookup: 0 };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = req.postData() ? JSON.parse(req.postData()) : undefined;
    if (url.pathname === "/api/v1/store/payment-options") { state.calls.options++; return fulfil(route, 200, { online: state.offered === null ? null : { provider: "STRIPE", currencies: state.offered } }); }
    if (url.pathname === "/api/v1/reservations/lookup") { state.calls.lookup++; return body?.phone === PHONE ? fulfil(route, 200, state.reservation) : fulfil(route, 404, { status: 404, code: "reservation_not_found" }); }
    if (url.pathname.endsWith("/payments/checkout-session")) { state.calls.session.push({ body, headers: req.headers() }); return state.session(route, body); }
    if (url.pathname.endsWith("/payments/status")) { state.calls.status.push(body); return state.status(route, body); }
    if (url.pathname === "/api/v1/categories") return fulfil(route, 200, []);
    if (url.pathname === "/api/v1/store/pickup") return fulfil(route, 200, { status: "available", unavailableMessage: null, location: { storeName: "Magasin test", addressLine: "1 rue Test", city: "Ville", region: "Ouest", country: "HT", phone: "+509 0000 0000", additionalLocationInfo: { fr: "", ht: "" }, schedule: [] }, instructions: { general: { fr: "", ht: "" } } });
    return fulfil(route, 404, { status: 404, code: "not_found" });
  });
  // The hosted Stripe page is replaced too: nothing leaves this machine.
  await page.route("https://checkout.stripe.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><title>MOCK Stripe Checkout</title><body>MOCK Stripe-hosted Checkout</body></html>" }));
  await page.route("https://evil.example/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>EVIL</body></html>" }));
}

const newState = (over = {}) => ({ offered: ["USD"], reservation: reservation(), session: (route) => fulfil(route, 201, { attemptId: "att-1", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_mock", currency: "USD", amount: "18.50", expiresAt: "2026-11-17T10:30:00Z", reused: false }), status: (route) => fulfil(route, 200, statusBody(attempt("PENDING"))), ...over });

async function newPage(browser, { width = 1280, height = 900, locale = "fr", withAccess = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (withAccess) await ctx.addInitScript(([ref, phone]) => { try { sessionStorage.setItem("ana.guest-access.v1", JSON.stringify({ [ref]: phone })); } catch { /* none */ } }, [REF, PHONE]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|CORS|net::/.test(m.text())) errors.push(`console ${m.text().slice(0, 140)}`); });
  page.errors = errors;
  return { ctx, page, locale };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const noCardFields = (page) => page.evaluate(() => !document.querySelector("iframe, input[autocomplete^='cc-'], input[name*='card' i], input[placeholder*='carte' i], input[placeholder*='CVC' i]"));

const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
const consoleErrors = [];
try {
  // ------------------------------------------------------------------------------------------------------------------------------------------
  section("A. Reservation ready, USD offered, HTG not offered (390px and 1280px)");
  for (const width of [390, 1280]) {
    const { page, ctx } = await newPage(browser, { width });
    const st = newState(); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByTestId("online-pay").waitFor();
    const t = await text(page);
    check(`${width}px: pay at pickup is presented first, and online payment has its own heading`, /Payer au retrait/.test(t) && /Payer en ligne/.test(t) && t.indexOf("Payer au retrait") < t.indexOf("Payer en ligne"));
    check(`${width}px: "Paiement sécurisé par Stripe" is shown`, /Paiement sécurisé par Stripe/.test(t));
    check(`${width}px: exactly one online button, in the offered currency, with the server's amount`, (await page.getByRole("button", { name: /Payer en ligne —/ }).count()) === 1 && /Payer en ligne — 18,50 USD/.test(t));
    check(`${width}px: HTG (not offered) stays payable at the store, no button, no conversion`, /pas proposé pour HTG/.test(t) && !/Payer en ligne — .*HTG/.test(t) && !/convers|taux de change/i.test(t));
    check(`${width}px: no combined HTG+USD total anywhere in the payment block`, !/\b1\s?518/.test(t));
    check(`${width}px: no checkout session was created just by opening the page`, st.calls.session.length === 0);
    check(`${width}px: no card fields, iframes or Stripe script on the page`, await noCardFields(page));
    check(`${width}px: no horizontal overflow`, (await overflow(page)) <= 0, await overflow(page));
    await page.getByTestId("online-pay").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/stripe-track-${width}.png`, fullPage: false });
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------
  section("B. Clicking the button: request shape and redirect");
  {
    const { page, ctx } = await newPage(browser, { width: 390 });
    const st = newState(); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByRole("button", { name: /Payer en ligne —/ }).waitFor();
    await Promise.all([page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 }), page.getByRole("button", { name: /Payer en ligne —/ }).click()]);
    const call = st.calls.session[0];
    check("one session request, with currency and the guest phone only (no amount, no total, no token)", st.calls.session.length === 1 && JSON.stringify(Object.keys(call.body).sort()) === JSON.stringify(["currency", "phone"]) && call.body.currency === "USD", JSON.stringify(call.body));
    check("an Idempotency-Key header was sent", !!call.headers["idempotency-key"] && call.headers["idempotency-key"].length >= 16);
    check("no Authorization header on a guest request", !call.headers["authorization"]);
    check("the browser was redirected to the Stripe-hosted URL returned by the backend", /checkout\.stripe\.com\/c\/pay\/cs_test_mock/.test(page.url()) && /MOCK Stripe/.test(await text(page)));
    await ctx.close();
  }
  {
    const { page, ctx } = await newPage(browser);
    const st = newState({ session: (route) => fulfil(route, 201, { attemptId: "x", checkoutUrl: "https://evil.example/pay", currency: "USD", amount: "18.50", expiresAt: "x", reused: false }) }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByRole("button", { name: /Payer en ligne —/ }).click();
    await page.getByText(/adresse de paiement reçue n'est pas valide/).waitFor();
    check("a checkout URL that is not Stripe's https host is refused: no navigation, clear message", page.url().startsWith(WEB) && !/EVIL/.test(await text(page)));
    check("the button is usable again after a refused redirect", await page.getByRole("button", { name: /Payer en ligne —/ }).isEnabled());
    await ctx.close();
  }
  for (const [code, status, expected] of [["currency_not_available_online", 422, /pas proposé dans cette devise/], ["payment_provider_error", 502, /service de paiement ne répond pas/], ["amount_below_minimum", 422, /inférieur au minimum/], ["rate_limited", 429, /Trop de demandes/]]) {
    const { page, ctx } = await newPage(browser);
    const st = newState({ session: (route) => fulfil(route, status, { status, code }) }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByRole("button", { name: /Payer en ligne —/ }).click();
    await page.getByRole("alert").filter({ hasText: /\S/ }).first().waitFor();
    check(`error ${code} (${status}) is translated and the reservation stays`, expected.test(await text(page)) && /Payer au retrait/.test(await text(page)));
    await ctx.close();
  }
  {
    // An uncertain outcome (no answer): the retry of the SAME request must reuse the SAME key; a definite answer ends the attempt.
    const { page, ctx } = await newPage(browser);
    let n = 0;
    const st = newState({ session: (route) => (++n === 1 ? route.abort("failed") : fulfil(route, 201, { attemptId: "att-1", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_mock", currency: "USD", amount: "18.50", expiresAt: "x", reused: true })) }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByRole("button", { name: /Payer en ligne —/ }).click();
    await page.getByRole("alert").filter({ hasText: /\S/ }).first().waitFor();
    await Promise.all([page.waitForURL(/checkout\.stripe\.com/), page.getByRole("button", { name: /Payer en ligne —/ }).click()]);
    check("after a lost answer, the retry reuses the same Idempotency-Key (cannot create a second session)", st.calls.session.length === 2 && st.calls.session[0].headers["idempotency-key"] === st.calls.session[1].headers["idempotency-key"]);
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------
  section("C. Mixed currencies, disabled Stripe, not-ready reservation");
  {
    const { page, ctx } = await newPage(browser);
    const st = newState({ offered: ["HTG", "USD"] }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByTestId("online-pay").waitFor();
    const buttons = (await page.getByRole("button", { name: /Payer en ligne —/ }).allInnerTexts()).map((b) => b.replace(/[\u00a0\u202f]/g, " "));
    check("both currencies offered: one separate button each, never a combined amount", buttons.length === 2 && buttons.some((b) => /1\s?500,00 HTG/.test(b)) && buttons.some((b) => /18,50 USD/.test(b)), buttons.join(" | "));
    await ctx.close();
  }
  {
    const { page, ctx } = await newPage(browser);
    const st = newState({ offered: null }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByText(REF).first().waitFor(); await sleep(800);
    check("Stripe disabled (payment-options: online null): no online option at all, pay-at-store text remains", (await page.getByTestId("online-pay").count()) === 0 && /payer au magasin|paiement se fait au magasin/i.test(await text(page)));
    await ctx.close();
  }
  {
    const { page, ctx } = await newPage(browser);
    const st = newState({ offered: [] }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByText(REF).first().waitFor(); await sleep(800);
    check("no currency eligible (empty list): no online option", (await page.getByTestId("online-pay").count()) === 0);
    await ctx.close();
  }
  {
    const { page, ctx } = await newPage(browser);
    const st = newState({ reservation: reservation({ status: "CONFIRMED" }) }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByTestId("online-pay").waitFor();
    check("reservation not ready yet: online payment is announced, not offered (no button)", /une fois votre réservation prête/.test(await text(page)) && (await page.getByRole("button", { name: /Payer en ligne —/ }).count()) === 0);
    await ctx.close();
  }
  {
    const { page, ctx } = await newPage(browser);
    const st = newState({ reservation: reservation({ usdDue: "0.00", htgDue: "0.00" }) }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/reservations/${REF}`); await page.getByText(REF).first().waitFor(); await sleep(800);
    check("fully paid reservation: no payment prompt", (await page.getByTestId("online-pay").count()) === 0);
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------
  section("D. Return page: success is never assumed (polling schedule is real, so this takes ~15 s)");
  for (const width of [390, 1280]) {
    const { page, ctx } = await newPage(browser, { width });
    let n = 0;
    const st = newState({ status: (route) => { n++; return fulfil(route, 200, statusBody(attempt(n === 1 ? "PENDING" : n === 2 ? "PROCESSING" : "SUCCEEDED"))); } }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/payment/return?reference=${REF}&attempt=att-1`);
    await page.getByRole("heading", { name: "Vérification du paiement en cours" }).waitFor();
    const early = await text(page);
    check(`${width}px: while PENDING the page says it is checking, and does NOT say confirmed`, /Vérification du paiement en cours/.test(early) && !/Paiement confirmé/.test(early));
    await page.screenshot({ path: `${SHOTS}/stripe-return-pending-${width}.png` });
    await page.getByRole("heading", { name: "Paiement en cours de traitement" }).waitFor({ timeout: 8000 });
    check(`${width}px: PROCESSING is shown as not yet confirmed`, !/Paiement confirmé/.test(await text(page)));
    await page.getByRole("heading", { name: "Paiement confirmé" }).waitFor({ timeout: 14000 });
    const done = await text(page);
    check(`${width}px: confirmed only after the backend answered SUCCEEDED, with the settled amount in its own currency`, /Nous avons bien reçu 18,50 USD/.test(done));
    check(`${width}px: the unpaid HTG balance is still shown separately (reservation not marked fully paid)`, /Reste à payer/.test(done) && /HTG/.test(done) && !/entièrement payée/.test(done));
    check(`${width}px: status requests carried the guest phone in the body, not in the URL`, st.calls.status.length >= 3 && st.calls.status.every((b) => b.phone === PHONE && b.attemptId === "att-1") && !page.url().includes(PHONE));
    const calls = st.calls.status.length; await sleep(5000);
    check(`${width}px: polling stopped after a final answer`, st.calls.status.length === calls, `${calls} -> ${st.calls.status.length}`);
    check(`${width}px: no overflow, no card fields`, (await overflow(page)) <= 0 && (await noCardFields(page)));
    await page.screenshot({ path: `${SHOTS}/stripe-return-success-${width}.png`, fullPage: true });
    check(`${width}px: no unexpected page errors`, page.errors.length === 0, page.errors.join(" | "));
    await ctx.close();
  }
  for (const [status, heading, re] of [["FAILED", "Le paiement a échoué", /Aucun montant n'a été enregistré.*conservée/s], ["EXPIRED", "La page de paiement a expiré", /Aucun montant n'a été enregistré/]]) {
    const { page, ctx } = await newPage(browser, { width: 390 });
    const st = newState({ status: (route) => fulfil(route, 200, statusBody(attempt(status))) }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/payment/return?reference=${REF}&attempt=att-1`);
    await page.getByRole("heading", { name: heading }).waitFor();
    const t = await text(page);
    check(`${status}: shown as not paid, reservation kept, balances untouched, no confirmation wording`, re.test(t) && !/Paiement confirmé/.test(t) && /Reste à payer/.test(t));
    const calls = st.calls.status.length; await sleep(3500);
    check(`${status}: terminal, so polling stops`, st.calls.status.length === calls);
    if (status === "FAILED") await page.screenshot({ path: `${SHOTS}/stripe-return-failed-390.png`, fullPage: true });
    await ctx.close();
  }
  {
    // Still undecided when the (shortened) schedule ends: a manual "check again" button, no endless polling. Uses the real schedule's total, so it is time-bounded rather than waited out.
    const { page, ctx } = await newPage(browser, { width: 390 });
    const st = newState({ status: (route) => fulfil(route, 200, statusBody(attempt("PENDING"))) }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/payment/return?reference=${REF}&attempt=att-1`);
    await page.getByRole("button", { name: "Vérifier à nouveau" }).waitFor();
    await sleep(21000);
    const n = st.calls.status.length;
    check("pending for a while: a gentle schedule (2s, 4s, 8s, 15s…) rather than aggressive polling", n >= 3 && n <= 5, `${n} requests in ~25 s`);
    await page.getByRole("button", { name: "Vérifier à nouveau" }).click(); await sleep(600);
    check("the manual button asks again", st.calls.status.length > n);
    await ctx.close();
  }
  {
    const { page, ctx } = await newPage(browser, { width: 390 });
    const st = newState({ status: (route) => fulfil(route, 200, statusBody(attempt("SUCCEEDED"))) }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/payment/return?reference=${REF}`);
    const t0 = await text(page); void t0;
    await page.getByRole("heading", { name: "Paiement confirmé" }).waitFor();
    check("return URL without an attempt id still asks the backend (and uses its attempt)", st.calls.status.length >= 1 && st.calls.status[0].attemptId === undefined);
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------
  section("E. Return page opened without access (another tab/browser)");
  {
    const { page, ctx } = await newPage(browser, { width: 390, withAccess: false });
    const st = newState({ status: (route, body) => (body?.phone === PHONE ? fulfil(route, 200, statusBody(attempt("SUCCEEDED"))) : fulfil(route, 404, { status: 404, code: "reservation_not_found" })) }); await mockApi(page, st);
    await page.goto(`${WEB}/fr/payment/return?reference=${REF}&attempt=att-1`);
    await page.getByRole("heading", { name: "Confirmez votre numéro de téléphone" }).waitFor();
    check("no phone known: asks for it, makes no status request yet", st.calls.status.length === 0);
    await page.getByLabel(/Téléphone/i).fill("0000"); await page.getByRole("button", { name: "Afficher l'état du paiement" }).click();
    await page.getByText(/Nous n'avons trouvé aucune réservation/).waitFor();
    check("wrong phone: the same generic 'not found' message", true);
    await page.getByLabel(/Téléphone/i).fill(PHONE); await page.getByRole("button", { name: "Afficher l'état du paiement" }).click();
    await page.getByRole("heading", { name: "Paiement confirmé" }).waitFor();
    check("right phone: the verified state is shown", true);
    await page.screenshot({ path: `${SHOTS}/stripe-return-phone-390.png`, fullPage: true });
    await ctx.close();
  }
  {
    const { page, ctx } = await newPage(browser, { width: 390 });
    const st = newState(); await mockApi(page, st);
    await page.goto(`${WEB}/fr/payment/return?reference=../../etc/passwd`);
    await page.getByText(/Référence de réservation introuvable/).waitFor();
    check("a malformed reference is refused locally: no status request is sent", st.calls.status.length === 0);
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------
  section("F. Cancelled Checkout");
  for (const width of [390, 1280]) {
    const { page, ctx } = await newPage(browser, { width });
    const st = newState(); await mockApi(page, st);
    await page.goto(`${WEB}/fr/payment/cancelled?reference=${REF}`);
    await page.getByRole("heading", { name: "Paiement non terminé" }).waitFor();
    const t = await page.locator("main").innerText().then((x) => x.replace(/[\u00a0\u202f]/g, " "));
    check(`${width}px: "Paiement non terminé", the reservation is kept, pay-at-store still possible`, /Votre réservation est conservée/.test(t) && /payer au magasin/.test(t));
    const claim = t.match(/annulée|remboursé|remboursement|confirmé/i);
    check(`${width}px: never claims cancellation, success or a refund`, !claim, claim?.[0]);
    check(`${width}px: no payment request was made by the cancelled page`, st.calls.status.length === 0 && st.calls.session.length === 0);
    await page.getByRole("link", { name: "Revenir à ma réservation" }).click();
    await page.waitForURL(new RegExp(`/fr/reservations/${REF}`));
    check(`${width}px: the way back leads to the reservation`, true);
    if (width === 390) { await page.goBack(); await page.screenshot({ path: `${SHOTS}/stripe-cancelled-390.png`, fullPage: true }); }
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------
  section("G. Haitian Creole");
  {
    const { page, ctx } = await newPage(browser, { width: 390 });
    const st = newState(); await mockApi(page, st);
    await page.goto(`${WEB}/ht/reservations/${REF}`); await page.getByTestId("online-pay").waitFor();
    const t = await text(page);
    check("ht: the owner-supplied labels are shown", /Peye lè w vin pran kòmann lan/.test(t) && /Peye sou entènèt/.test(t) && /Peman an sekirite ak Stripe/.test(t));
    check("ht: no French leaked into the payment block", !/Payer au retrait|Paiement sécurisé/.test(t));
    await page.screenshot({ path: `${SHOTS}/stripe-track-ht-390.png` });
    await page.goto(`${WEB}/ht/payment/cancelled?reference=${REF}`);
    await page.getByRole("heading", { name: "Peman an pa fini" }).waitFor();
    check("ht: cancelled page uses the supplied strings", /Rezèvasyon ou a toujou la/.test(await text(page)));
    st.status = (route) => fulfil(route, 200, statusBody(attempt("PENDING")));
    await page.goto(`${WEB}/ht/payment/return?reference=${REF}&attempt=att-1`);
    await page.getByRole("heading", { name: "N ap verifye peman an" }).waitFor();
    check("ht: checking state uses the supplied string", true);
    st.status = (route) => fulfil(route, 200, statusBody(attempt("SUCCEEDED")));
    await page.getByRole("button", { name: "Verifye ankò" }).click();
    await page.getByRole("heading", { name: "Peman an konfime" }).waitFor();
    check("ht: confirmed state uses the supplied string", true);
    await ctx.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed  (ALL MOCKED: no real API, no Stripe)`);
if (consoleErrors.length) console.log(consoleErrors.join("\n"));
process.exit(failed.length ? 1 : 0);
