/**
 * STOREFRONT browser suite — LOCAL STACK (real Spring Boot API + local Supabase + MinIO), not mocks and not a hosted project.
 * Prerequisites and how to run: e2e/storefront/README.md. Seed data first (e2e/storefront/seed.py).
 */
import { admin, adminProduct, bodyText, check, env, key, launch, mailFor, linkOf, money, newPage, overflow, pageErrors, productBySlug, publicApi, results, section, settle, shot, sleep, uniqPhone } from "./lib.mjs";

const browser = await launch();
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script`, false, String(e.message).split("\n")[0]); } };
const ref = /ANA-[A-Z0-9]{6}/;

const slugs = { tee: "t-shirt-en-coton", pot: "casserole-en-aluminium", hammer: "marteau-de-menuisier", lamp: "lampe-solaire", rug: "tapis-de-sol" };
const P = {};
for (const [k, s] of Object.entries(slugs)) P[k] = await productBySlug(s);

// The suite consumes stock (it collects reservations); restore a known baseline so it can be run repeatedly.
for (const [prod, variantSku, target] of [[P.pot, null, 40], [P.tee, "TEE-001-S", 10], [P.tee, "TEE-001-M", 2], [P.hammer, null, 5], [P.rug, null, 25]]) {
  const variant = variantSku ? prod.variants.find((v) => v.sku === variantSku) : undefined;
  const inv = (await admin("GET", `/admin/inventory?productId=${prod.id}&size=50`)).body.items.find((i) => (variant ? i.variantId === variant.id : true));
  const diff = target - inv.onHand;
  if (diff !== 0) await admin("POST", `/admin/inventory/${inv.id}/adjustments`, { type: diff > 0 ? "ADD" : "REDUCE", quantity: Math.abs(diff), reason: "CORRECTION", note: "e2e baseline" }, key());
}

/** Adds a product from its page: optional currency, optional variant, quantity. */
async function addFromPage(page, slug, { currency, variant, qty } = {}) {
  await page.goto(`${env.WEB}/fr/products/${slug}`);
  await settle(page);
  if (currency) await page.getByRole("button", { name: new RegExp(currency) }).click();
  if (variant) await page.getByRole("radio", { name: new RegExp(`^(Taille|Gwosè) ${variant}`) }).click();
  if (qty && qty > 1) { const q = page.getByRole("group", { name: /Quantité/ }).locator("input").first(); await q.fill(String(qty)); await q.blur(); }
  await page.getByRole("button", { name: "Ajouter au panier" }).first().click();
  await sleep(300);
}

// ================= 1. anonymous browsing =================
await run("browse", async () => {
  section("1. Browse without signing in (1280px)");
  const { page } = await newPage(browser);
  const apiCalls = [];
  page.on("request", (r) => { if (r.url().startsWith(env.API)) apiCalls.push(r); });
  await page.goto(`${env.WEB}/fr`);
  await settle(page);
  const t = await bodyText(page);
  check("home: categories come from the API", ["Maison", "Vêtements", "Outils"].every((c) => t.includes(c)));
  const newest = (await publicApi("/products?sort=newest&size=8")).items[0];
  const newestPrice = newest.prices[0];
  check("home: latest products come from the API, with price and currency", t.includes(newest.name.fr) && t.includes(money(Number(newestPrice.salePrice ?? newestPrice.retailPrice), newestPrice.currency)) && /Derniers produits/.test(t), newest.name.fr);
  check("home: general-merchandise positioning is kept (no furniture-only copy)", t.includes("Tout ce qu'il vous faut"));
  check("home: pickup address in the footer is the one from the API", t.includes("Magasin de vérification (données de test)"));
  check("home: no 'demo/sample store' wording on the live storefront", !/fictifs|exemple|démo/i.test(t.replace(/Magasin de vérification \(données de test\)/g, "")));
  check("public reads send no Authorization header", apiCalls.every((r) => !r.headers().authorization));
  const ls = await page.evaluate(() => Object.keys(localStorage));
  check("no demo business data in localStorage after browsing", !ls.some((k) => /ana\.demo\./.test(k)), ls.join(","));
  await shot(page, "01-home-1280");
  // a product whose image object really exists in the store (other suites may have deleted seeded objects)
  let withImage = null;
  for (const p of (await publicApi("/products?size=40")).items) {
    const url = p.images?.[0]?.url;
    if (url && (await fetch(url, { method: "HEAD" }).catch(() => ({ ok: false }))).ok) { withImage = p; break; }
  }
  await page.goto(`${env.WEB}/fr/products/${withImage?.slug}`);
  await settle(page);
  const imgs = await page.evaluate(() => [...document.images].filter((i) => i.src.includes(":9000")).map((i) => ({ ok: i.complete && i.naturalWidth > 0, src: i.src })));
  check("product images load from the configured public asset URL (MinIO standing in for R2)", withImage !== null && imgs.length >= 1 && imgs.every((i) => i.ok), `${imgs.length} images`);
  await page.goto(`${env.WEB}/fr/products`);
  await settle(page);
  await page.getByRole("link", { name: "Tous les produits" }).first().click();
  await settle(page);
  const list = await bodyText(page);
  const totalProducts = (await publicApi("/products?size=1")).totalItems;
  check(`listing: pagination from the API (${totalProducts} products, 12 per page)`, new RegExp(`${totalProducts} produits`).test(list) && (await page.getByRole("navigation", { name: /Pagination/i }).count()) > 0);
  await shot(page, "02-products-1280");
  await page.goto(`${env.WEB}/fr/products?page=2`);
  await settle(page);
  check("listing: page 2 shows the remaining products", (await page.locator("article").count()) === Math.min(12, totalProducts - 12), String(await page.locator("article").count()));
});

// ================= 2. search =================
await run("search", async () => {
  section("2. Search through the backend (PostgreSQL full-text)");
  const { page } = await newPage(browser);
  const searchCalls = [];
  page.on("request", (r) => { if (r.url().includes("/products/search")) searchCalls.push(r.url()); });
  await page.goto(`${env.WEB}/fr`);
  await settle(page);
  const box = page.getByRole("combobox").first();
  await box.click();
  await box.pressSequentially("tapis", { delay: 60 });
  await page.getByRole("option", { name: /Tapis de sol/ }).waitFor({ timeout: 5000 });
  check("suggestions come from the search endpoint", true);
  check("typing is debounced: 5 keystrokes produce at most 2 requests", searchCalls.length >= 1 && searchCalls.length <= 2, String(searchCalls.length));
  await box.press("Enter");
  await page.waitForURL(/\/search\?q=tapis/);
  await settle(page);
  check("results page lists the match", (await bodyText(page)).includes("Tapis de sol"));
  check("the query is preserved in the search box after navigating", (await page.getByRole("combobox").first().inputValue()) === "tapis");
  await shot(page, "03-search-1280");

  const results = async (q, loc = "fr") => { await page.goto(`${env.WEB}/${loc}/search?q=${encodeURIComponent(q)}`); await settle(page); return bodyText(page); };
  check("accent-folded prefix: 'vetem' (no accent, prefix) finds the T-shirt through its category", (await results("vetem")).includes("T-shirt en coton"));
  check("Haitian Creole: 'tishet' (accent folded) finds 'Tishèt koton'", (await results("tishet", "ht")).includes("Tishèt koton"));
  const typo = await results("tshirt");
  check("no typo tolerance is promised: a typo gives the honest empty state", /Aucun résultat/.test(typo) && /ne corrige pas les fautes de frappe/.test(typo));
  const tooLong = await results("a".repeat(120));
  check("an over-long query shows a translated error, not a raw backend message", /trop longue/.test(tooLong) && !/search_query_too_long|422/.test(tooLong), tooLong.slice(0, 100));
  const empty = await results("");
  check("search with an empty query is not an error (lists products)", !/erreur|Impossible/i.test(empty) && /produits/.test(empty));
});

// ================= 3. category filter, attribute filter, currency/price =================
await run("filters", async () => {
  section("3. Category, attribute, currency and price filters");
  const { page } = await newPage(browser);
  await page.goto(`${env.WEB}/fr`);
  await settle(page);
  await page.getByRole("navigation").getByRole("link", { name: "Vêtements", exact: true }).first().click();
  await page.waitForURL(/category=vetements/);
  await settle(page);
  const cat = await bodyText(page);
  check("category filter: only that category's products", cat.includes("T-shirt en coton") && !cat.includes("Marteau") && !cat.includes("Casserole"));
  await page.goto(`${env.WEB}/fr/products?category=maison&attr=color:rouge`);
  await settle(page);
  const attr = await bodyText(page);
  check("attribute filter (category-defined, from the API): only the red product", attr.includes("Casserole en aluminium") && !attr.includes("Tapis de sol"));
  check("attribute facet shows no invented counts", /Couleur/.test(attr) && !/Rouge \(\d/.test(attr));
  await page.goto(`${env.WEB}/fr/products?currency=USD&min=10&max=14&sort=price-asc`);
  await settle(page);
  const usd = await bodyText(page);
  check("currency + price range: only USD products inside the range (HTG-only products absent)", usd.includes("T-shirt en coton") && !usd.includes("Lampe solaire") && !usd.includes("Marteau"), usd.slice(usd.indexOf("produit")).slice(0, 80));
  await page.goto(`${env.WEB}/fr/products?sort=price-asc`);
  await settle(page);
  check("price sort without a currency is explained, never mixes HTG and USD", /Choisissez une devise/.test(await bodyText(page)));
  await page.goto(`${env.WEB}/fr/products?category=does-not-exist`);
  await settle(page);
  check("unknown category: not-found state", /introuvable|Page introuvable|n'existe/i.test(await bodyText(page)));
  await page.goto(`${env.WEB}/fr/products?wholesale=1&inStock=1&stock=1`);
  await settle(page);
  check("wholesale + in-stock filters return products", (await page.locator("article").count()) > 0);
});

// ================= 4. product detail =================
await run("pdp", async () => {
  section("4. Product details: variants, per-currency prices, availability");
  const { page } = await newPage(browser);
  await page.goto(`${env.WEB}/fr/products/${slugs.tee}`);
  await settle(page);
  let t = await bodyText(page);
  check("PDP: ONE product with an HTG and a USD price button, each with its own price", t.includes(money(1500, "HTG")) && t.includes(money(10.5, "USD")));
  check("PDP: sizes come from the category", (await page.getByRole("radio").count()) === 3);
  await page.getByRole("radio", { name: /Taille L/ }).click();
  await sleep(200);
  check("PDP: the out-of-stock size cannot be added to the cart", (await page.getByRole("button", { name: /Rupture|Épuisé|indisponible/i }).first().isDisabled()) && /Épuisé/.test(await bodyText(page)));
  await page.getByRole("radio", { name: /Taille S/ }).click();
  const sAvail = (await productBySlug(slugs.tee)).variants.find((v) => v.sku === "TEE-001-S").availableQuantity;
  check("PDP: availability shows the API's availableQuantity for the selected variant", new RegExp(`${sAvail} pièces disponibles`).test(t), String(sAvail));
  await page.getByRole("button", { name: /10,50 USD/ }).click();
  await sleep(200);
  t = await bodyText(page);
  check("PDP: choosing USD shows the USD price and USD wholesale tier, no HTG", t.includes(money(10.5, "USD")) && t.includes(money(9, "USD")) && !/1 300,00 HTG/.test(t));
  await page.getByRole("radio", { name: /Taille M/ }).click();
  await sleep(200);
  t = await bodyText(page);
  check("PDP: low-stock variant shows its own availability", /Stock limité/.test(t) && /2 pièces disponibles/.test(t));
  await shot(page, "04-pdp-1280");
  await page.goto(`${env.WEB}/fr/products/does-not-exist`);
  await settle(page);
  check("PDP: unknown product is a clean not-found", /introuvable|n'existe/i.test(await bodyText(page)));
  await page.goto(`${env.WEB}/ht/products/${slugs.tee}`);
  await settle(page);
  t = await bodyText(page);
  check("PDP in Haitian Creole: name, options and labels are localized", t.includes("Tishèt koton") && t.includes("Gwosè") && !/\{|apiErrors\./.test(t));
});

// ================= 5. cart (mixed currencies) =================
await run("cart", async () => {
  section("5. Cart: variants, quantities, mixed HTG/USD subtotals");
  const { page } = await newPage(browser);
  await addFromPage(page, slugs.pot, { qty: 1 });
  await addFromPage(page, slugs.tee, { currency: "USD", variant: "S", qty: 2 });
  await addFromPage(page, slugs.hammer, { qty: 1 });
  await page.goto(`${env.WEB}/fr/cart`);
  await settle(page);
  let t = await bodyText(page);
  check("cart: lines keep product identity, variant and unit", t.includes("Casserole en aluminium") && t.includes("T-shirt en coton") && /Taille : S/.test(t) && t.includes("Marteau de menuisier"));
  check("cart: separate subtotals per currency (HTG 2 800 / USD 36)", t.includes(money(2800, "HTG")) && t.includes(money(36, "USD")));
  check("cart: no combined total across currencies", !t.includes("2 836") && !t.includes("2 800,00 USD") && /deux devises/.test(t));
  const cq = page.getByRole("group", { name: /Quantité de Casserole/ }).locator("input");
  await cq.fill("6");
  await cq.blur();
  await sleep(300);
  t = await bodyText(page);
  check("cart: quantity change re-prices with the wholesale tier (6 × 2 500 = 15 000 HTG)", t.includes(money(15000, "HTG")) && /gros/i.test(t));
  await shot(page, "05-cart-1280");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ana.cart.v4") ?? "[]"));
  check("cart is stored under the new key and holds the API's product ids", stored.length === 3 && stored.every((l) => /^[0-9a-f-]{36}$/.test(l.productId)));
  check("old demo cart keys are gone", !(await page.evaluate(() => Object.keys(localStorage).some((k) => /^ana\.demo\.(cart|profile|guestrefs)/.test(k)))));
});


// ---------- staff helpers (real staff API) ----------
async function inventoryOf(productId, variantId) {
  const items = (await admin("GET", `/admin/inventory?productId=${productId}&size=50`)).body.items;
  return variantId ? items.find((i) => i.variantId === variantId) : items[0];
}
const adjust = async (productId, type, quantity, variantId) => {
  const inv = await inventoryOf(productId, variantId);
  const r = await admin("POST", `/admin/inventory/${inv.id}/adjustments`, { type, quantity, reason: "CORRECTION", note: "storefront e2e" }, key());
  if (r.status >= 300) throw new Error(`adjust ${type} ${quantity} -> ${r.status}`);
};
async function setHtgRetail(productId, retail) {
  const d = await adminProduct(productId);
  const body = { version: d.version, sku: d.sku, slug: d.slug, categoryId: d.categoryId, name: d.name, description: d.description, brand: d.brand, unit: d.unit, unitNote: d.unitNote, status: d.status,
    prices: d.prices.map((p) => (p.currency === "HTG" ? { ...p, retail } : p)), variants: d.variants, attributes: d.attributes };
  const r = await admin("PUT", `/admin/products/${productId}`, body);
  if (r.status >= 300) throw new Error(`reprice -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
}
const reservationByRef = async (reference) => (await admin("GET", `/admin/reservations?q=${reference}`)).body.items.find((x) => x.reference === reference);
const detailByRef = async (reference) => (await admin("GET", `/admin/reservations/${(await reservationByRef(reference)).id}`)).body;
async function fillContact(page, c) {
  await page.getByLabel("Prénom").fill(c.first);
  await page.getByLabel("Nom", { exact: true }).fill(c.last);
  await page.getByLabel("Téléphone").fill(c.phone);
  if (c.email) await page.getByLabel("E-mail").fill(c.email);
  await page.getByRole("button", { name: "Continuer vers le retrait" }).click();
  await page.getByRole("button", { name: "Continuer vers la vérification" }).waitFor();
  await page.getByRole("button", { name: "Continuer vers la vérification" }).click();
  await page.getByRole("button", { name: /Envoyer la réservation|Réessayer l'envoi/ }).waitFor();
}
const acceptTerms = (page) => page.getByRole("checkbox", { name: /J'ai lu et je comprends/ }).check();

// ================= 6. cart revalidation =================
await run("revalidation", async () => {
  section("6. Cart revalidation against the server (price change, stock, unpublished)");
  const { page } = await newPage(browser);
  await addFromPage(page, slugs.pot, { qty: 1 });
  await addFromPage(page, slugs.hammer, { qty: 1 });
  await setHtgRetail(P.pot.id, "3100.00");
  try {
    await page.goto(`${env.WEB}/fr/cart`);
    await settle(page);
    let t = await bodyText(page);
    check("a price that changed on the server is reported with before → after", /Des prix ont changé/.test(t) && /2 800,00 HTG → 3 100,00 HTG/.test(t));
    const reserve = page.getByRole("link", { name: "Réserver ces produits" });
    check("reservation is blocked until the cart is updated", (await reserve.getAttribute("aria-disabled")) === "true");
    await page.getByRole("button", { name: "Mettre à jour les prix" }).click();
    await sleep(800);
    t = await bodyText(page);
    check("explicit update applies the new price (no silent change before)", /3 100,00 HTG/.test(t) && !/Des prix ont changé/.test(t));
  } finally { await setHtgRetail(P.pot.id, "2800.00"); }
  await adjust(P.hammer.id, "REDUCE", 5);
  try {
    await page.goto(`${env.WEB}/fr/cart`);
    await settle(page);
    const t = await bodyText(page);
    check("a product that is now out of stock is flagged and blocks the reservation", /n'est plus disponible/.test(t) && (await page.getByRole("link", { name: "Réserver ces produits" }).getAttribute("aria-disabled")) === "true");
    await shot(page, "06-cart-issues-1280");
  } finally { await adjust(P.hammer.id, "ADD", 5); }
  await page.goto(`${env.WEB}/fr/cart`);
  await settle(page);
  await page.getByRole("button", { name: /Retirer Marteau/ }).or(page.getByRole("button", { name: /^Retirer$/ }).nth(1)).first().click().catch(() => {});
});

// ================= 7. guest reservation (HTG + USD) =================
const guest = { first: "Marie", last: "Vérification", phone: uniqPhone(), email: "marie.guest@example.test" };
let guestRef = null;
await run("guest", async () => {
  section("7. Guest reservation: HTG + USD, real reference, duplicate protection");
  const { page } = await newPage(browser);
  const potBefore = (await inventoryOf(P.pot.id)).reserved;
  const teeS = P.tee.variants.find((v) => v.sku === "TEE-001-S");
  const teeBefore = (await inventoryOf(P.tee.id, teeS.id)).reserved;
  await addFromPage(page, slugs.pot, { qty: 1 });
  await addFromPage(page, slugs.tee, { currency: "USD", variant: "S", qty: 2 });
  const posts = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/v1/reservations")) posts.push({ body: r.postData() ?? "", headers: r.headers() }); });
  await page.goto(`${env.WEB}/fr/reserve`);
  await settle(page);
  check("reserve page offers guest checkout (no account required)", /sans compte|invité/i.test(await bodyText(page)));
  await fillContact(page, guest);
  let t = await bodyText(page);
  check("review shows the live pickup address from the API", t.includes("Magasin de vérification (données de test)") && t.includes("1, rue de l'Essai"));
  check("review shows the terms version label (and no invented legal text)", t.includes(`version ${env.TERMS}`));
  await page.getByRole("button", { name: "Envoyer la réservation" }).click();
  await sleep(300);
  check("submitting without acknowledging the terms is refused, nothing sent", /Cochez la case/.test(await bodyText(page)) && posts.length === 0);
  await shot(page, "07-reserve-review-1280");
  await acceptTerms(page);
  const submit = page.getByRole("button", { name: "Envoyer la réservation" });
  await submit.dblclick();
  await page.waitForURL(/\/reserve\/confirmation\/ANA-/, { timeout: 15000 });
  await settle(page);
  t = await bodyText(page);
  guestRef = (t.match(ref) ?? [])[0];
  check("confirmation shows a real backend reference", !!guestRef, guestRef);
  check("double-click sent exactly ONE request (with one Idempotency-Key)", posts.length === 1 && !!posts[0].headers["idempotency-key"], String(posts.length));
  check("the request carried no prices or totals", !/price|total|amount|unitPrice/i.test(posts[0].body), posts[0].body.slice(0, 160));
  check("confirmation is truthful: received, pending review, unpaid — not confirmed/paid/ready", /Réservation reçue/.test(t) && /En attente de validation/.test(t) && /pas encore confirmée/.test(t) && !/Payée|Prête à retirer|Acceptée/.test(t));
  check("confirmation shows the SERVER's totals per currency, never combined", t.includes(money(2800, "HTG")) && t.includes(money(21, "USD")) && !t.includes("2 821"));
  await shot(page, "08-confirmation-1280");
  const cartAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("ana.cart.v4") ?? "[]"));
  check("the cart is cleared only after the server confirmed", cartAfter.length === 0);

  const d = await detailByRef(guestRef);
  check("backend: reservation pending, unpaid, French, with both currencies", d.status === "PENDING_REVIEW" && d.paymentStatus === "UNPAID" && d.locale === "fr" && d.balances.map((b) => b.currency).sort().join() === "HTG,USD");
  check("backend: totals priced by the server (HTG 2800.00, USD 21.00 = 2 × 10.50 sale)", d.balances.find((b) => b.currency === "HTG").total === "2800.00" && d.balances.find((b) => b.currency === "USD").total === "21.00");
  check("backend: terms acknowledgement stored with the configured version and a timestamp", d.terms?.version === env.TERMS && !!d.terms?.acceptedAt, JSON.stringify(d.terms));
  check("backend: stock is held (reserved) for both items, shared across currencies", (await inventoryOf(P.pot.id)).reserved === potBefore + 1 && (await inventoryOf(P.tee.id, teeS.id)).reserved === teeBefore + 2);
  const all = (await admin("GET", `/admin/reservations?q=${guest.phone}`)).body.items;
  check("backend: exactly one reservation exists for this guest", all.length === 1, String(all.length));
});

// ================= 8. tracking =================
await run("tracking", async () => {
  section("8. Guest tracking by reference + phone (fresh browser: no stored access)");
  if (!guestRef) throw new Error("no reservation to track");
  const { page } = await newPage(browser);
  await page.goto(`${env.WEB}/fr/reservations`);
  await settle(page);
  const lookup = async (reference, phone) => {
    await page.getByLabel("Référence").fill(reference);
    await page.getByLabel("Téléphone").fill(phone);
    await page.getByRole("button", { name: "Afficher ma réservation" }).click();
    await sleep(900);
    return bodyText(page);
  };
  const wrongPhone = await lookup(guestRef, "39999999");
  const unknownRef = await lookup("ANA-ZZZZZZ", guest.phone);
  const msg = (x) => (x.match(/Nous n'avons trouvé aucune réservation[^.]*\./) ?? [""])[0];
  check("wrong phone: generic not-found message", msg(wrongPhone) !== "");
  check("unknown reference gives the IDENTICAL message (no enumeration)", msg(unknownRef) === msg(wrongPhone));
  check("a too-short phone cannot match (suffix attack)", msg(await lookup(guestRef, guest.phone.slice(-4))) !== "");
  await lookup(` ${guestRef.toLowerCase()} `, `+509 ${guest.phone.slice(0, 4)} ${guest.phone.slice(4)}`);
  await page.waitForURL(/\/reservations\/ANA-/, { timeout: 8000 });
  await settle(page);
  const t = await bodyText(page);
  check("digits-only phone matching + case/space-insensitive reference opens the reservation", t.includes(guestRef) && /En attente de validation/.test(t));
  check("tracking shows products, quantities and per-currency amounts", t.includes("Casserole en aluminium") && t.includes("T-shirt en coton") && t.includes(money(2800, "HTG")) && t.includes(money(21, "USD")));
  check("tracking shows balances per currency (nothing paid yet)", /Reste à payer/.test(t) && t.includes(money(0, "HTG")) && /Non payée/.test(t));
  check("tracking shows the pickup promised at submission", t.includes("1, rue de l'Essai") && /Horaires/.test(t));
  check("no cancel button (no customer cancellation policy)", !/Annuler la réservation/.test(t));
  check("history lists only the real events", /Reçue|Envoyée|Réservation envoyée|soumise/i.test(t) || (await page.locator("ol[aria-label='Historique'] li").count()) === 1);
  await shot(page, "09-tracking-1280");
  const other = await newPage(browser);
  await other.page.goto(`${env.WEB}/fr/reservations/${guestRef}`);
  await settle(other.page);
  const gate = await bodyText(other.page);
  check("opening the URL without credentials shows only the phone gate (no data)", /Vérifiez votre identité/.test(gate) && !gate.includes("Casserole"));
});

// ================= 9. staff lifecycle, privacy, collection =================
await run("lifecycle", async () => {
  section("9. Staff confirms, readies, records payments, collects — and the customer sees only what is public");
  if (!guestRef) throw new Error("no reservation");
  const r = await reservationByRef(guestRef);
  const id = r.id;
  const teeS = P.tee.variants.find((v) => v.sku === "TEE-001-S");
  const before = { pot: await inventoryOf(P.pot.id), tee: await inventoryOf(P.tee.id, teeS.id) };
  const { page } = await newPage(browser);
  const lookupBodies = [];
  page.on("response", async (resp) => { if (resp.url().endsWith("/reservations/lookup")) lookupBodies.push(await resp.text().catch(() => "")); });
  const open = async () => {
    await page.goto(`${env.WEB}/fr/reservations`);
    await settle(page);
    await page.getByLabel("Référence").fill(guestRef);
    await page.getByLabel("Téléphone").fill(guest.phone);
    await page.getByRole("button", { name: "Afficher ma réservation" }).click();
    await page.waitForURL(/\/reservations\/ANA-/);
    await settle(page);
    return bodyText(page);
  };
  await admin("POST", `/admin/reservations/${id}/notes`, { visibility: "INTERNAL", body: "SECRET-INTERNAL-NOTE do not show" }, key());
  await admin("POST", `/admin/reservations/${id}/notes`, { visibility: "CUSTOMER_VISIBLE", body: "Passez demain après 10 h" }, key());
  check("staff accepts the reservation", (await admin("POST", `/admin/reservations/${id}/accept`, undefined, key())).status === 200);
  let t = await open();
  check("customer sees 'Acceptée' (status comes from the server)", /Acceptée/.test(t));
  check("customer sees the customer-visible note", /Passez demain après 10 h/.test(t));
  const fullDom = await page.content();
  const bad = ["SECRET-INTERNAL-NOTE", env.STAFF_EMAIL, "userId"];
  const apiOnly = ['"author"', '"actor"', '"visibility"', '"ledger', '"customerId"', '"reasonNote"'];
  const leaked = [...bad.filter((b) => fullDom.includes(b)), ...[...bad, ...apiOnly].filter((b) => lookupBodies.some((x) => x.includes(b)))];
  check("internal notes, staff identity and ids are absent from the page AND from the API response", lookupBodies.length > 0 && leaked.length === 0, leaked.join(","));
  check("payments are not shown as made because the reservation was accepted", /Non payée/.test(t));
  check("staff marks it ready", (await admin("POST", `/admin/reservations/${id}/ready`, {}, key())).status === 200);
  t = await open();
  check("customer sees 'Prête à retirer' with the pickup instructions of the snapshot", /Prête à retirer/.test(t) && /Vos produits sont prêts/.test(t));
  const pay = (amount, currency) => admin("POST", `/admin/reservations/${id}/payments`, { amount, currency, method: "CASH_AT_PICKUP" }, key());
  check("staff records the HTG payment only", (await pay("2800.00", "HTG")).status === 201);
  t = await open();
  check("tracking: partially paid; HTG settled, USD still due, per currency", /Partiellement payée/.test(t) && /Reste à payer/.test(t) && t.includes(money(21, "USD")));
  check("collection is refused while USD is unpaid (server rule)", (await admin("POST", `/admin/reservations/${id}/collect`, undefined, key())).status === 409);
  check("staff records the USD payment", (await pay("21.00", "USD")).status === 201);
  check("staff collects", (await admin("POST", `/admin/reservations/${id}/collect`, undefined, key())).status === 200);
  t = await open();
  check("tracking: collected and fully paid", /Retirée/.test(t) && /Payée/.test(t));
  await shot(page, "10-tracking-collected-1280");
  const after = { pot: await inventoryOf(P.pot.id), tee: await inventoryOf(P.tee.id, teeS.id) };
  check("stock deducted exactly once (casserole −1, T-shirt S −2) and no longer reserved", after.pot.onHand === before.pot.onHand - 1 && after.tee.onHand === before.tee.onHand - 2 && after.pot.reserved === before.pot.reserved - 1 && after.tee.reserved === before.tee.reserved - 2, `${before.pot.onHand}->${after.pot.onHand}, ${before.tee.onHand}->${after.tee.onHand}`);
  check("collecting twice does not deduct again", (await admin("POST", `/admin/reservations/${id}/collect`, undefined, key())).status === 409 && (await inventoryOf(P.pot.id)).onHand === after.pot.onHand);
  const rec = (await admin("GET", `/admin/reservations/${id}/reconciliation`)).body;
  const ledger = (await admin("GET", `/admin/reservations/${id}/ledger`)).body;
  check("ledger is consistent: one received entry per currency", rec.consistent === true && ledger.filter((e) => e.type === "PAYMENT_RECEIVED").length === 2);
});

// ================= 10. uncertain outcome: server processed, the answer was lost =================
await run("uncertain", async () => {
  section("10. Timeout/lost answer after submission: safe retry with the same Idempotency-Key");
  const { page } = await newPage(browser);
  const c = { first: "Jean", last: "Incertain", phone: uniqPhone() };
  await addFromPage(page, slugs.pot, { qty: 1 });
  await page.goto(`${env.WEB}/fr/reserve`);
  await settle(page);
  await fillContact(page, c);
  await acceptTerms(page);
  const keys = [];
  let dropped = false;
  await page.route("**/api/v1/reservations", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (!dropped) { dropped = true; await route.fetch(); return route.abort("failed"); } // the server DID process it; the browser never hears back
    return route.continue();
  });
  await page.getByRole("button", { name: "Envoyer la réservation" }).click();
  await page.getByText(/Nous ne savons pas si votre réservation a été enregistrée/).waitFor({ timeout: 10000 });
  check("the outcome is reported as UNCERTAIN, not as failure or success", true);
  const serverSide = (await admin("GET", `/admin/reservations?q=${c.phone}`)).body.items;
  check("(the server had in fact recorded it once)", serverSide.length === 1);
  check("the cart is kept after an uncertain outcome", (await page.evaluate(() => JSON.parse(localStorage.getItem("ana.cart.v4") ?? "[]"))).length === 1);
  await shot(page, "11-uncertain-1280");
  await page.getByRole("button", { name: "Réessayer l'envoi" }).click();
  await page.waitForURL(/\/reserve\/confirmation\/ANA-/, { timeout: 15000 });
  await settle(page);
  const refShown = ((await bodyText(page)).match(ref) ?? [])[0];
  const after = (await admin("GET", `/admin/reservations?q=${c.phone}`)).body.items;
  check("the retry reused the SAME Idempotency-Key", keys.length === 2 && keys[0] === keys[1], keys.join(" / "));
  check("no duplicate: still exactly one reservation, and the confirmation shows ITS reference", after.length === 1 && after[0].reference === refShown, `${after.length} ${refShown}`);
});

// ================= 11. stock gone between the check and the submit =================
await run("insufficient", async () => {
  section("11. Insufficient stock at submission (server decides; nothing reserved; cart kept)");
  const { page } = await newPage(browser);
  const c = { first: "Paul", last: "Stock", phone: uniqPhone() };
  await addFromPage(page, slugs.hammer, { qty: 3 });
  await page.goto(`${env.WEB}/fr/reserve`);
  await settle(page);
  await fillContact(page, c);
  await acceptTerms(page);
  await adjust(P.hammer.id, "REDUCE", 4); // someone else took the units after the cart check
  try {
    await page.getByRole("button", { name: "Envoyer la réservation" }).click();
    await page.getByText(/Réservation non envoyée/).waitFor({ timeout: 10000 });
    const t = await bodyText(page);
    check("the server's 409 is shown as a translated message, no raw detail", /Le stock ne suffit plus/.test(t) && !/Only \d+ available|insufficient_stock|409/.test(t));
    check("nothing was reserved", (await admin("GET", `/admin/reservations?q=${c.phone}`)).body.items.length === 0);
    check("the cart is kept so the customer can fix it", (await page.evaluate(() => JSON.parse(localStorage.getItem("ana.cart.v4") ?? "[]"))).length === 1);
    check("the cart check now flags the line and blocks sending", /Retour au panier/.test(t) || (await page.getByRole("button", { name: "Envoyer la réservation" }).isDisabled()));
    await shot(page, "12-insufficient-1280");
  } finally { await adjust(P.hammer.id, "ADD", 4); }
});

// ================= 12. pickup disabled =================
await run("pickup-disabled", async () => {
  section("12. Pickup disabled by the owner: reservations are blocked and explained");
  const current = async () => (await admin("GET", "/admin/settings/pickup")).body;
  const put = async (patch) => { const cur = await current(); return admin("PUT", "/admin/settings/pickup", { ...cur, ...patch }); };
  const { page } = await newPage(browser);
  await addFromPage(page, slugs.pot, { qty: 1 });
  check("owner disables pickup with a public message", (await put({ enabled: false, unavailableMessage: { fr: "Fermé pour inventaire.", ht: "Fèmen pou envantè." } })).status === 200);
  try {
    await sleep(31000); // the storefront caches the pickup answer for 30 s
    await page.goto(`${env.WEB}/fr/reserve`);
    await settle(page);
    await page.getByLabel("Prénom").fill("A"); await page.getByLabel("Nom", { exact: true }).fill("B"); await page.getByLabel("Téléphone").fill(uniqPhone());
    await page.getByRole("button", { name: "Continuer vers le retrait" }).click();
    await settle(page);
    const t = await bodyText(page);
    check("the owner's message is shown, no address is invented", /Retrait temporairement indisponible/.test(t) && /Fermé pour inventaire/.test(t) && !t.includes("1, rue de l'Essai"));
    check("the customer cannot continue", await page.getByRole("button", { name: "Continuer vers la vérification" }).isDisabled());
    await shot(page, "13-pickup-disabled-1280");
    const direct = await fetch(`${env.API}/api/v1/reservations`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ lines: [{ productId: P.pot.id, quantity: 1, currency: "HTG" }], contact: { firstName: "A", lastName: "B", dialCode: "+509", phone: "37001234" }, locale: "fr", acknowledgedTerms: true }) });
    check("the server refuses too (422 pickup_disabled), the form is not the only guard", direct.status === 422 && (await direct.json()).code === "pickup_disabled");
  } finally { await put({ enabled: true, unavailableMessage: { fr: "", ht: "" } }); }
});

// ================= 13. error handling =================
await run("errors", async () => {
  section("13. Error handling: network, 429, 5xx, timeout (requests faked in the browser; the app's reaction is what is tested)");
  const { page } = await newPage(browser, { serviceWorkers: "block" });
  // The plain listing is rendered on the SERVER (its first answer is in the HTML), so a browser-side failure must not blank it...
  await page.route("**/api/v1/products**", (r) => r.abort("failed"));
  await page.goto(`${env.WEB}/fr/products`);
  await settle(page);
  check("server-rendered listing stays usable when the browser cannot reach the API", (await page.locator("article").count()) > 0 && !/Connexion impossible/.test(await bodyText(page)));
  // ...while a filtered listing is loaded by the browser, which is where the error states are exercised.
  await page.goto(`${env.WEB}/fr/products?stock=1`);
  // the client retries an idempotent GET a few times with backoff before giving up: wait for the final message
  await page.getByText("Connexion impossible").first().waitFor({ timeout: 20000 }).catch(() => {});
  let t = await bodyText(page);
  check("network failure: translated message and a retry button", /Connexion impossible/.test(t) && (await page.getByRole("button", { name: "Réessayer" }).count()) > 0);
  await page.unroute("**/api/v1/products**");
  await page.getByRole("button", { name: "Réessayer" }).first().click();
  await settle(page);
  check("retry recovers once the network is back", (await page.locator("article").count()) > 0);
  await page.route("**/api/v1/products**", (r) => r.fulfill({ status: 429, headers: { "Retry-After": "30", "Content-Type": "application/problem+json" }, body: JSON.stringify({ status: 429, code: "rate_limited", detail: "Too many requests" }) }));
  await page.goto(`${env.WEB}/fr/products?stock=1`); await settle(page);
  t = await bodyText(page);
  check("429: translated 'too many requests' message", /Trop de demandes/.test(t) && !/rate_limited|Too many/.test(t));
  await page.unroute("**/api/v1/products**");
  await page.route("**/api/v1/products**", (r) => r.fulfill({ status: 500, headers: { "Content-Type": "application/problem+json" }, body: JSON.stringify({ status: 500, code: "internal_error", detail: "java.lang.NullPointerException at com.anadepot.Secret.line(42)" }) }));
  await page.goto(`${env.WEB}/fr/products?stock=1`); await settle(page);
  t = await bodyText(page);
  check("5xx: generic message, the stack trace/internal detail is never shown", /Une erreur est survenue de notre côté/.test(t) && !/NullPointer|anadepot|Secret/.test(t));
  await shot(page, "14-error-state-1280");
  await page.unroute("**/api/v1/products**");
  await page.route("**/api/v1/store/pickup", () => { /* never answered: the client timeout applies */ });
  await page.goto(`${env.WEB}/fr/info/pickup`);
  // a GET that never answers is retried a bounded number of times with backoff (10 s timeout each): wait for the final message, not a fixed time
  await page.getByText(/met trop de temps/).first().waitFor({ timeout: 90000 }).catch(() => {});
  t = await bodyText(page);
  check("timeout: translated 'server is slow' message with retry", /met trop de temps/.test(t));
});

// ================= 14. registered customer =================
const customerEmail = `cust-${Date.now()}@example.test`;
const customerPw = "Str0ng-pass-1";
const customerPhone = uniqPhone();
let customerRef = null, customerToken = null, customerReservationId = null;
await run("accounts", async () => {
  section("14. Registered customer: sign-up, e-mail verification, sign-in, history, profile, expiry, sign-out");
  // a GUEST reservation with the same e-mail and phone, made BEFORE the account exists: it must never merge into the account
  const g = await newPage(browser);
  await addFromPage(g.page, slugs.rug, { qty: 1 });
  await g.page.goto(`${env.WEB}/fr/reserve`);
  await settle(g.page);
  await fillContact(g.page, { first: "Chloé", last: "Client", phone: customerPhone, email: customerEmail });
  await acceptTerms(g.page);
  await g.page.getByRole("button", { name: "Envoyer la réservation" }).click();
  await g.page.waitForURL(/confirmation\/ANA-/);
  await settle(g.page);
  const guestBefore = ((await bodyText(g.page)).match(ref) ?? [])[0];
  await g.ctx.close();

  const { ctx, page } = await newPage(browser);
  const since = Date.now() - 2000;
  await page.goto(`${env.WEB}/fr/auth/sign-up`);
  await settle(page);
  await page.getByLabel("E-mail").fill(customerEmail);
  await page.getByLabel("Mot de passe", { exact: true }).fill(customerPw);
  await page.getByLabel("Confirmer le mot de passe").fill(customerPw);
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await page.waitForURL(/auth\/sign-up-success/, { timeout: 20000 });
  check("registration (real Supabase Auth, supported UI block) asks to verify the e-mail", /Vérifiez votre e-mail/.test(await bodyText(page)));
  const mail = await mailFor(customerEmail, "Confirmation", since);
  check("a real verification e-mail arrived (Mailpit)", !!mail);
  await page.goto(linkOf(mail));
  await page.waitForURL(/\/fr\/account/, { timeout: 20000 });
  await settle(page);
  let t = await bodyText(page);
  check("verification link signs the customer in and opens the account", /\/fr\/account/.test(page.url()) && /Bonjour/.test(t));
  check("account history does NOT contain the earlier guest reservation (guests are never merged)", !t.includes(guestBefore) && /Aucune réservation/.test(t), guestBefore);
  const tokRes = await fetch(`${env.SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: customerEmail, password: customerPw }) });
  customerToken = (await tokRes.json()).access_token;
  const me = await (await fetch(`${env.API}/api/v1/me`, { headers: { Authorization: `Bearer ${customerToken}` } })).json();
  check("the backend (not the UI) knows this user as a customer, not staff", me.staff === false && me.email === customerEmail);

  // reserve while signed in
  await addFromPage(page, slugs.pot, { qty: 1 });
  await page.goto(`${env.WEB}/fr/reserve`);
  await settle(page);
  check("signed in: the e-mail is prefilled from the session", (await page.getByLabel("E-mail").inputValue()) === customerEmail);
  await fillContact(page, { first: "Chloé", last: "Client", phone: customerPhone, email: customerEmail });
  await acceptTerms(page);
  await page.getByRole("button", { name: "Envoyer la réservation" }).click();
  await page.waitForURL(/confirmation\/ANA-/);
  await settle(page);
  customerRef = ((await bodyText(page)).match(ref) ?? [])[0];
  check("a signed-in reservation gets a real reference", !!customerRef, customerRef);
  await page.goto(`${env.WEB}/fr/account/reservations`);
  await settle(page);
  t = await bodyText(page);
  check("history lists the customer's own reservation, not the earlier guest one", t.includes(customerRef) && !t.includes(guestBefore));
  await shot(page, "15-account-history-1280");
  await page.getByRole("link", { name: new RegExp(customerRef) }).click();
  await page.waitForURL(/mine=/);
  await settle(page);
  t = await bodyText(page);
  check("reservation details open from the account without asking for a phone", t.includes(customerRef) && t.includes("Casserole en aluminium") && !/Vérifiez votre identité/.test(t));
  const mine = (await (await fetch(`${env.API}/api/v1/me/reservations`, { headers: { Authorization: `Bearer ${customerToken}` } })).json()).items;
  customerReservationId = mine[0]?.id;
  check("backend: exactly the signed-in reservation is linked to the account", mine.length === 1 && mine[0].reference === customerRef, mine.map((m) => m.reference).join());

  // profile
  await page.goto(`${env.WEB}/fr/account/profile`);
  await settle(page);
  await page.getByLabel("Prénom").fill("Chloé");
  await page.getByLabel("Nom", { exact: true }).fill("Client");
  await page.getByLabel("Téléphone").fill(customerPhone);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await sleep(1200);
  const prof = await (await fetch(`${env.API}/api/v1/me/profile`, { headers: { Authorization: `Bearer ${customerToken}` } })).json();
  check("profile is saved in the BACKEND (not the browser)", prof.firstName === "Chloé" && prof.phone === customerPhone, JSON.stringify(prof));
  await page.reload();
  await settle(page);
  check("profile reloads from the backend", (await page.getByLabel("Prénom").inputValue()) === "Chloé");
  check("no profile/customer data kept in localStorage", !(await page.evaluate(() => Object.keys(localStorage).some((k) => /profile|customer|reservation/i.test(k)))));

  // another customer must not read this one's data; customers have no staff access
  const SK = process.env.SUPABASE_LOCAL_SECRET_KEY; // LOCAL stack only: used to create a second confirmed user; never sent to a browser
  if (SK) {
    const other = `other-${Date.now()}@example.test`;
    await fetch(`${env.SB}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: other, password: customerPw, email_confirm: true }) });
    const otherTok = (await (await fetch(`${env.SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email: other, password: customerPw }) })).json()).access_token;
    const theirs = await fetch(`${env.API}/api/v1/me/reservations/${customerReservationId}`, { headers: { Authorization: `Bearer ${otherTok}` } });
    const missing = await fetch(`${env.API}/api/v1/me/reservations/${crypto.randomUUID()}`, { headers: { Authorization: `Bearer ${otherTok}` } });
    const [tb, mb] = [await theirs.json(), await missing.json()];
    const shape = (b) => JSON.stringify({ status: b.status, code: b.code, title: b.title, detail: String(b.detail).replace(/[0-9a-f-]{36}/g, "<id>") }); // the body echoes only the id the CALLER asked for
    check("another customer's token cannot read this reservation: 404, identical to a missing one", theirs.status === 404 && missing.status === 404 && shape(tb) === shape(mb), shape(tb));
    const otherList = await (await fetch(`${env.API}/api/v1/me/reservations`, { headers: { Authorization: `Bearer ${otherTok}` } })).json();
    check("another customer's history is empty (no cross-account leakage)", otherList.items.length === 0);
  } else {
    console.log("SKIP  cross-customer access checks (set SUPABASE_LOCAL_SECRET_KEY of the LOCAL stack to run them)");
  }
  check("a customer token is refused on the staff API (403)", (await fetch(`${env.API}/api/v1/admin/products`, { headers: { Authorization: `Bearer ${customerToken}` } })).status === 403);
  await page.goto(`${env.WEB}/fr/admin`);
  await settle(page);
  check("a customer session cannot open the admin screens", !/Tableau de bord/.test(await bodyText(page)), page.url());

  // expired session while reserving: must not become a guest request
  await addFromPage(page, slugs.rug, { qty: 1 });
  await page.goto(`${env.WEB}/fr/reserve`);
  await settle(page);
  await fillContact(page, { first: "Chloé", last: "Client", phone: customerPhone, email: customerEmail });
  await acceptTerms(page);
  const posts = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/v1/reservations")) posts.push(r.url()); });
  await ctx.clearCookies(); // the session disappears (expired / revoked) while the page is open
  await page.getByRole("button", { name: "Envoyer la réservation" }).click();
  await sleep(1200);
  t = await bodyText(page);
  check("expired session: the customer is told so, NOT silently submitted as a guest", /Votre session a expiré/.test(t) && posts.length === 0);
  check("expired session: the cart is kept", (await page.evaluate(() => JSON.parse(localStorage.getItem("ana.cart.v4") ?? "[]"))).length === 1);
  await shot(page, "16-session-expired-1280");
  await page.goto(`${env.WEB}/fr/account/reservations`);
  await settle(page);
  check("expired session: the account area sends the visitor to sign in", /auth\/login/.test(page.url()));
  await ctx.close();

  // an API 401 while the page is open (token expired between loads)
  const b = await newPage(browser);
  await b.page.goto(`${env.WEB}/fr/auth/login`);
  await settle(b.page);
  await b.page.getByLabel("E-mail").fill(customerEmail);
  await b.page.getByLabel("Mot de passe", { exact: true }).fill(customerPw);
  await b.page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await b.page.waitForURL(/\/fr\/account/, { timeout: 20000 });
  await b.page.route("**/api/v1/me/reservations**", (r) => r.fulfill({ status: 401, headers: { "Content-Type": "application/problem+json" }, body: JSON.stringify({ status: 401, code: "unauthenticated" }) }));
  await b.page.goto(`${env.WEB}/fr/account/reservations`);
  await settle(b.page);
  t = await bodyText(b.page);
  check("a 401 from the API shows 'session expired' with a sign-in link (never an empty history)", /Votre session a expiré/.test(t) && !/Aucune réservation/.test(t));
  await b.page.unroute("**/api/v1/me/reservations**");

  // sign out, then guest flows still work
  await b.page.goto(`${env.WEB}/fr/account`);
  await settle(b.page);
  await b.page.getByRole("button", { name: "Se déconnecter" }).first().click();
  await b.page.waitForURL((u) => !/\/account/.test(u.pathname), { timeout: 15000 }).catch(() => {});
  await settle(b.page);
  await addFromPage(b.page, slugs.rug, { qty: 1 });
  await b.page.goto(`${env.WEB}/fr/reserve`);
  await settle(b.page);
  t = await bodyText(b.page);
  check("after sign-out the visitor can still browse and start a guest reservation", /Vous réservez en tant qu'invité/.test(t) && (await b.page.getByLabel("Prénom").count()) === 1);
  check("sign-out cleared the session (account area now asks to sign in)", await (async () => { await b.page.goto(`${env.WEB}/fr/account`); await settle(b.page); return /auth\/login/.test(b.page.url()); })());
  await b.ctx.close();
});

// ================= 15. mobile (390px) =================
await run("mobile", async () => {
  section("15. Mobile 390px: no horizontal overflow, readable journeys");
  const { page } = await newPage(browser, { width: 390, height: 844 });
  const pages = [["home", "/fr"], ["products", "/fr/products"], ["pdp", `/fr/products/${slugs.tee}`], ["search", "/fr/search?q=tapi"], ["tracking-form", "/fr/reservations"], ["info-pickup", "/fr/info/pickup"]];
  let n = 20;
  for (const [name, path] of pages) {
    await page.goto(`${env.WEB}${path}`);
    await settle(page);
    check(`390px: ${name} has no horizontal overflow`, (await overflow(page)) <= 0, String(await overflow(page)));
    await shot(page, `${n++}-mobile-${name}-390`);
  }
  // filters drawer on mobile
  await page.goto(`${env.WEB}/fr/products`);
  await settle(page);
  await page.getByRole("button", { name: /Filtres/ }).click();
  await sleep(400);
  check("390px: the filters drawer opens", (await page.getByRole("dialog").count()) > 0);
  await shot(page, `${n++}-mobile-filters-390`);
  await page.keyboard.press("Escape");
  // mobile search suggestions
  await page.goto(`${env.WEB}/fr`);
  await settle(page);
  const trigger = page.getByRole("button", { name: /Rechercher/ }).first();
  if (await trigger.count()) { await trigger.click(); await sleep(300); }
  const box = page.getByRole("combobox").first();
  await box.fill("tap");
  await page.getByRole("option", { name: /Tapis de sol/ }).waitFor({ timeout: 6000 });
  check("390px: search works on mobile with live suggestions", true);
  await shot(page, `${n++}-mobile-search-390`);
  // cart, reserve, tracking detail
  await addFromPage(page, slugs.pot, { qty: 1 });
  await addFromPage(page, slugs.tee, { currency: "USD", variant: "S", qty: 1 });
  for (const [name, path] of [["cart", "/fr/cart"], ["reserve", "/fr/reserve"]]) {
    await page.goto(`${env.WEB}${path}`);
    await settle(page);
    check(`390px: ${name} has no horizontal overflow`, (await overflow(page)) <= 0, String(await overflow(page)));
    await shot(page, `${n++}-mobile-${name}-390`);
  }
  await page.goto(`${env.WEB}/fr/reservations`);
  await settle(page);
  await page.getByLabel("Référence").fill(guestRef);
  await page.getByLabel("Téléphone").fill(guest.phone);
  await page.getByRole("button", { name: "Afficher ma réservation" }).click();
  await page.waitForURL(/\/reservations\/ANA-/);
  await settle(page);
  check("390px: reservation tracking has no horizontal overflow", (await overflow(page)) <= 0, String(await overflow(page)));
  await shot(page, `${n++}-mobile-tracking-390`);
});

// ================= 16. Haitian Creole =================
await run("creole", async () => {
  section("16. Haitian Creole journeys");
  const { page } = await newPage(browser);
  await page.goto(`${env.WEB}/ht`);
  await settle(page);
  let t = await bodyText(page);
  check("ht home: Creole copy, API categories in Creole", /Lakay/.test(t) && /Rad/.test(t) && /Dènye pwodwi yo/.test(t));
  await page.goto(`${env.WEB}/ht/reservations`);
  await settle(page);
  await page.getByLabel(/Referans|Nimewo/).first().fill(guestRef ?? "ANA-XXXXXX");
  await page.getByLabel(/Telefòn/).fill("39999999");
  await page.getByRole("button").filter({ hasText: /Montre|Afiche/ }).first().click();
  await sleep(900);
  t = await bodyText(page);
  check("ht tracking: wrong credentials give the Creole not-found message", /Nou pa jwenn okenn rezèvasyon/.test(t));
  await page.getByLabel(/Telefòn/).fill(guest.phone);
  await page.getByRole("button").filter({ hasText: /Montre|Afiche/ }).first().click();
  await page.waitForURL(/\/ht\/reservations\/ANA-/);
  await settle(page);
  t = await bodyText(page);
  check("ht tracking: status, balances and pickup in Creole", /Rete pou peye|Rès pou peye/.test(t) && /Retire|Peye/.test(t));
  check("ht pages show no raw message keys", !/\b(reserve|track|cart|account|catalog|apiErrors|dataState)\.[a-zA-Z_]+/.test(t));
  await shot(page, "30-ht-tracking-1280");
  await page.goto(`${env.WEB}/ht/products?q=tishet`);
  await settle(page);
  check("ht search through the API: 'tishet' finds the T-shirt", (await bodyText(page)).includes("Tishèt koton"));
});

// ================= 17. the real rate limiter =================
await run("rate-limit", async () => {
  section("17. The REAL rate limiter (tracking lookup is limited per client address)");
  const statuses = [];
  for (let i = 0; i < 70; i++) {
    const r = await fetch(`${env.API}/api/v1/reservations/lookup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: `ANA-RL${String(i).padStart(4, "0")}`, phone: "37000000" }) });
    statuses.push(r.status);
    if (r.status === 429) break;
  }
  check("the API answers 429 after the configured number of lookups", statuses.at(-1) === 429, `${statuses.length} calls`);
  const { page } = await newPage(browser);
  await page.goto(`${env.WEB}/fr/reservations`);
  await settle(page);
  await page.getByLabel("Référence").fill(guestRef);
  await page.getByLabel("Téléphone").fill(guest.phone);
  await page.getByRole("button", { name: "Afficher ma réservation" }).click();
  await sleep(1200);
  const t = await bodyText(page);
  check("the real 429 is shown as a translated 'too many requests' message", /Trop de demandes/.test(t) && !/rate_limited/.test(t));
  await shot(page, "31-real-429-1280");
});

console.log(`\n(part 3a done) ${results.filter((r) => r.ok).length} passed, ${results.filter((r) => !r.ok).length} failed`);

console.log(`\n(all sections done) ${results.filter((r) => r.ok).length} passed, ${results.filter((r) => !r.ok).length} failed`);
console.log(pageErrors.length ? `page errors:\n${pageErrors.join("\n")}` : "no unexpected page errors");
await browser.close();
process.exit(results.some((r) => !r.ok) ? 1 : 0);   // a failing check must fail the run (CI)
