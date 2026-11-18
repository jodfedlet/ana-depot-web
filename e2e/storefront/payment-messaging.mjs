/**
 * PAYMENT MESSAGING across the storefront — LOCAL STACK (real web build + real API for the catalog). The payment CAPABILITY answer (`GET /api/v1/store/payment-options`) is STUBBED in the browser
 * to drive every state, so this proves the FRONTEND's wording and behaviour for each state (label: MOCK capability response). The backend's own states are proved by
 * `OnlinePaymentIntegrationTest.theBackendStatesWhichPaymentOptionsExistRightNow` (real PostgreSQL + security chain), and the real "both" answer by e2e:stripe-real.
 *
 * States: both (card + pickup) · disabled (card off) · down (card on, provider unreachable) · closed (reservations closed) · unreachable (the capability call fails).
 * Rule under test: a card is mentioned ONLY when the backend says it is available; every other state shows wording that is true whatever the provider does.
 * Run: `npm run e2e:payment-messaging` (same setup as e2e/storefront/README.md; no staff login needed beyond the seed).
 */
import { check, env, launch, newPage, overflow, pageErrors, publicApi, results, section, settle, shot, bodyText } from "./lib.mjs";

const browser = await launch();
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script`, false, `${String(e.message).split("\n")[0]} @ ${(String(e.stack).match(/messaging\.mjs:(\d+)/) ?? [])[1] ?? "?"}`); } };
const norm = (t) => t.replace(/[  ]/g, " ");

const STATES = {
  both: { online: { provider: "STRIPE", currencies: ["USD"] }, onlineStatus: "AVAILABLE", atPickup: { available: true }, summary: "BOTH" },
  disabled: { online: null, onlineStatus: "DISABLED", atPickup: { available: true }, summary: "PICKUP_ONLY" },
  down: { online: null, onlineStatus: "TEMPORARILY_UNAVAILABLE", atPickup: { available: true }, summary: "PICKUP_ONLY" },
  closed: { online: null, onlineStatus: "DISABLED", atPickup: { available: false }, summary: "NONE" },
  unreachable: null,
};
async function stub(page, state) {
  await page.route("**/api/v1/store/payment-options", (route) => {
    const body = STATES[state];
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (body === null) return route.fulfill({ status: 500, headers: cors, contentType: "application/json", body: JSON.stringify({ code: "internal_error", status: 500 }) });
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  });
}
const card = { fr: /par carte|carte en ligne|Carte en ligne|Stripe/, ht: /ak kat|ak kat\b|kat sou entènèt|Kat sou entènèt|Stripe/ };

const products = (await publicApi("/products?size=30")).items ?? [];
const plain = products.find((p) => !(p.variants ?? []).length && (p.availableQuantity ?? 1) > 0 && (p.prices ?? []).length > 0);
if (!plain) { console.error("seed the catalog first (e2e/storefront/seed.py)"); process.exit(2); }

async function withState(state, lang, width, fn) {
  const { ctx, page } = await newPage(browser, { width, height: width > 600 ? 900 : 844, serviceWorkers: "block" });
  await stub(page, state);
  try { await fn(page); } finally { await ctx.close(); }
}
const mode = (s) => (s === "both" ? "both" : s === "closed" ? "closed" : "pickup");
const T = {
  fr: {
    announce: { both: /payez par carte ou au magasin lors du retrait, selon les options disponibles/, pickup: /payez au magasin lors du retrait/, closed: /réservations sont momentanément indisponibles/ },
    pay: { both: ["Payez comme vous le souhaitez", /Payez en ligne par carte ou au magasin lors du retrait, selon les options proposées/], pickup: ["Payez au retrait", /Payez au magasin lors du retrait\. Aucun paiement n'est demandé à la réservation/] },
    cart: { both: /payez par carte en ligne ou au magasin lors du retrait/, pickup: /vous payez au magasin, lors du retrait/ },
    product: { both: /payez par carte en ligne ou au magasin lors du retrait/, pickup: /Payez au magasin lors du retrait\. Aucun paiement n'est demandé à la réservation/ },
    info: { both: /payez par carte en ligne ou au magasin avec votre référence/, pickup: /payez sur place et récupérez vos produits/ },
    add: "Ajouter au panier", cartPath: "cart", infoPath: "info/how-it-works",
  },
  ht: {
    announce: { both: /peye ak kat oswa nan magazen an/, pickup: /peye nan magazen an le w vin pran pwodwi yo/, closed: /Rezèvasyon yo pa disponib/ },
    pay: { both: ["Peye jan w vle", /Peye sou entènèt ak kat oswa nan magazen an/], pickup: ["Peye le w vin pran l", /Peye nan magazen an le w vin pran pwodwi yo\. Yo pa mande w peye lè w ap rezève/] },
    cart: { both: /peye ak kat sou entènèt oswa nan magazen an/, pickup: /ou peye nan magazen an, le w vin pran l/ },
    product: { both: /peye ak kat sou entènèt oswa nan magazen an/, pickup: /Peye nan magazen an le w vin pran l\. Yo pa mande w peye lè w ap rezève/ },
    info: { both: /peye ak kat sou entènèt oswa nan magazen an ak referans ou/, pickup: /peye sou plas epi pran pwodwi w yo/ },
    add: "Mete nan panye", cartPath: "cart", infoPath: "info/how-it-works",
  },
};

for (const lang of ["fr", "ht"]) {
  for (const state of Object.keys(STATES)) {
    await run(`${lang}/${state}`, async () => {
      section(`${lang} — card state "${state}" (capability response stubbed)`);
      const m = mode(state), t = T[lang];
      // ---- home, desktop
      await withState(state, lang, 1280, async (page) => {
        await page.goto(`${env.WEB}/${lang}`); await settle(page, 1200);
        const body = norm(await bodyText(page));
        const head = norm(await page.locator("header").first().innerText());
        check(`home announcement: ${m === "both" ? "mentions card AND pickup" : m === "closed" ? "says reservations are unavailable" : "pay at pickup only"}`, t.announce[m].test(head), head.slice(0, 160));
        if (m !== "closed") {
          const [title, text] = t.pay[m === "both" ? "both" : "pickup"];
          const benefits = norm(await page.getByRole("region", { name: /Comment réserver|Ki jan pou rezève/ }).innerText().catch(() => body));
          check("home benefits: payment title and description match the state", benefits.includes(title) && text.test(benefits), benefits.slice(0, 200));
        }
        if (m !== "both") check("nothing on the home page advertises a card", !card[lang].test(body), (body.match(card[lang]) ?? [""])[0]);
        else check("the home page mentions the card option exactly as agreed", /carte|kat/i.test(body));
      });
      // ---- cart, product, info (desktop)
      await withState(state, lang, 1280, async (page) => {
        await page.goto(`${env.WEB}/${lang}/products/${plain.slug}`); await settle(page, 1000);
        const prod = norm(await bodyText(page));
        check("product page payment note matches the state", t.product[m === "both" ? "both" : "pickup"].test(prod) || m === "closed", prod.slice(-200));
        if (m !== "both") check("product page advertises no card", !card[lang].test(prod));
        await page.getByRole("button", { name: t.add }).first().click(); await settle(page, 500);
        await page.goto(`${env.WEB}/${lang}/${t.cartPath}`); await settle(page, 1000);
        const cart = norm(await bodyText(page));
        check("cart note matches the state", t.cart[m === "both" ? "both" : "pickup"].test(cart), cart.slice(0, 160));
        if (m !== "both") check("cart advertises no card", !card[lang].test(cart));
        await page.goto(`${env.WEB}/${lang}/${t.infoPath}`); await settle(page, 1000);
        const info = norm(await bodyText(page));
        check("How-it-works page matches the state", t.info[m === "both" ? "both" : "pickup"].test(info), info.slice(0, 120));
        if (m !== "both") check("How-it-works page advertises no card", !card[lang].test(info));
        if (lang === "fr") {
          // the reservation flow: the card option appears (as "available once the reservation is ready", not selectable now) only when the backend says so
          await page.goto(`${env.WEB}/fr/reserve`); await settle(page, 800);
          await page.getByLabel("Prénom").fill("Msg"); await page.getByLabel("Nom", { exact: true }).fill("Check"); await page.getByLabel("Téléphone").fill("3700" + String(Math.floor(Math.random() * 9000 + 1000)));
          await page.getByRole("button", { name: "Continuer vers le retrait" }).click(); await settle(page, 800);
          const flow = norm(await bodyText(page));
          if (m === "both") {
            check("reserve step lists the card option, not selectable now, and explains when it opens", /Carte en ligne \(Stripe\)/.test(flow) && /Rien n'est débité maintenant/.test(flow) && (await page.locator("#pay-card").isDisabled()));
            check("reserve step says the customer reserves without paying and pays by card or at the store when ready", /payez par carte en ligne ou au magasin/.test(flow) || /vous payez par carte en ligne ou au magasin/.test(flow));
          } else if (m === "pickup") {
            check("reserve step offers pay at pickup and no card", !/Carte en ligne|Stripe/.test(flow) && /Vous payez au magasin lors du retrait/.test(flow));
          }
          check("cash at pickup is always selectable when reservations are open (a reservation never depends on a card)", m === "closed" || (await page.locator("#pay-cash").isChecked()), "");
        }
      });
    });
  }
}

await run("layout", async () => {
  section("Home page at desktop and mobile widths (both / pickup only)");
  for (const [state, width, name] of [["both", 1280, "d-both"], ["both", 390, "m-both"], ["disabled", 1280, "d-pickup"], ["disabled", 390, "m-pickup"]]) {
    await withState(state, "fr", width, async (page) => {
      await page.goto(`${env.WEB}/fr`); await settle(page, 1500);
      check(`home ${name}: no horizontal scroll`, (await overflow(page)) <= 0, String(await overflow(page)));
      await shot(page, `payment-msg-home-${name}`);
    });
  }
});

await run("a11y-nobrowser-errors", async () => {
  check("no browser errors during the run", pageErrors.filter((e) => !/500|Failed to fetch|payment-options|internal_error/.test(e)).length === 0, pageErrors.slice(0, 2).join(" | "));
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
