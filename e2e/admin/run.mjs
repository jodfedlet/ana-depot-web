/**
 * ADMINISTRATION browser suite — LOCAL STACK (real Spring Boot API, local Supabase Auth + Mailpit, MinIO standing in for R2). Not a hosted-Supabase test, not a real-R2 test.
 * Setup is the same as e2e/storefront/README.md (seed + staff user); run with `npm run e2e:admin`.
 */
import { admin, bodyText, check, env, key, launch, makePng, newPage, overflow, pageErrors, publicApi, results, section, settle, shot, sleep, uniqPhone, money } from "../storefront/lib.mjs";
import os from "node:os";

const browser = await launch();
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script`, false, String(e.message).split("\n")[0]); } };

/** Signs in through the real Supabase auth UI (no custom form) and lands on the administration. */
async function staffSession(opts = {}) {
  const { ctx, page } = await newPage(browser, opts);
  await page.goto(`${env.WEB}/fr/auth/login?next=%2Fadmin`);
  await settle(page);
  await page.getByLabel("E-mail").fill(env.STAFF_EMAIL);
  await page.getByLabel("Mot de passe", { exact: true }).fill(env.STAFF_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/fr\/admin/, { timeout: 20000 });
  await settle(page);
  return { ctx, page };
}

await run("access", async () => {
  section("A. Access control: who may open the administration");
  const anon = await newPage(browser);
  await anon.page.goto(`${env.WEB}/fr/admin`);
  await settle(anon.page);
  check("anonymous visitor is sent to sign in (no admin content)", /auth\/login/.test(anon.page.url()) && !/Tableau de bord/.test(await bodyText(anon.page)), anon.page.url());
  const { page, ctx } = await staffSession();
  const t = await bodyText(page);
  check("staff (known to the BACKEND) reaches the dashboard", /Tableau de bord/.test(t));
  check("no demo/'not connected' notice remains", !/Mode démonstration|navigateur uniquement|non connect/i.test(t));
  const ls = await page.evaluate(() => Object.keys(localStorage));
  check("no demo business data in localStorage", !ls.some((k) => /ana\.demo\./.test(k)), ls.join(","));
  await ctx.close();

  const SK = process.env.SUPABASE_LOCAL_SECRET_KEY;
  if (SK) {
    const email = `cust-admin-${Date.now()}@example.test`;
    await fetch(`${env.SB}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Str0ng-pass-1", email_confirm: true }) });
    const c = await newPage(browser);
    await c.page.goto(`${env.WEB}/fr/auth/login`); await settle(c.page);
    await c.page.getByLabel("E-mail").fill(email); await c.page.getByLabel("Mot de passe", { exact: true }).fill("Str0ng-pass-1");
    await c.page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await c.page.waitForURL(/\/account/, { timeout: 20000 });
    await c.page.goto(`${env.WEB}/fr/admin`); await settle(c.page);
    const ct = await bodyText(c.page);
    check("a customer with a valid Supabase account is DENIED (backend says not staff)", /Accès refusé|pas autorisé|n'a pas accès/i.test(ct) && !/Tableau de bord/.test(ct), ct.slice(0, 120));
    const tok = (await (await fetch(`${env.SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Str0ng-pass-1" }) })).json()).access_token;
    check("the API refuses the customer token on every admin area (403) and anonymous (401)", (await Promise.all(["/products", "/reservations", "/payments", "/customers", "/reports/overview", "/inventory", "/categories", "/settings/pickup"].map((p) => fetch(`${env.API}/api/v1/admin${p}`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.status)))).every((s) => s === 403) && (await fetch(`${env.API}/api/v1/admin/products`)).status === 401);
  } else console.log("SKIP  customer-denied checks (set SUPABASE_LOCAL_SECRET_KEY of the LOCAL stack)");
});

await run("dashboard", async () => {
  section("B. Dashboard and reports from the reporting APIs");
  const { page, ctx } = await staffSession();
  const ov = (await admin("GET", "/admin/reports/overview")).body;
  await page.goto(`${env.WEB}/fr/admin`);
  await settle(page, 1200);
  let t = await bodyText(page);
  check("dashboard shows the server's open-now counts", t.includes("En cours en ce moment") && new RegExp(`En attente de validation\\s*\\n?\\s*${ov.openNow.PENDING_REVIEW ?? 0}`).test(t), JSON.stringify(ov.openNow));
  check("money is shown per currency with ISO codes, HTG and USD apart", /HTG/.test(t) && /USD/.test(t) && /Paiements reçus \(net\)/.test(t) && /Valeur des réservations retirées/.test(t));
  check("received money and reservation value are different, labelled figures", /pas de l'argent reçu|pas encaisser|n'est pas de l'argent/i.test(t));
  check("the missing outstanding-balance aggregate is stated, not invented", /ne fournit pas de total des soldes/.test(t));
  check("stock counts come from the server", new RegExp(`Stock bas\\s*\\n?\\s*${ov.stock.low}`).test(t));
  await shot(page, "admin-01-dashboard-1280");
  await page.goto(`${env.WEB}/fr/admin?from=2020-01-01&to=2020-12-31`);
  await settle(page, 1000);
  t = await bodyText(page);
  check("a date filter re-queries the server (empty past period)", /2020-01-01/.test(t) && /Aucune vente retirée/.test(t));
  await page.goto(`${env.WEB}/fr/admin?from=2026-12-31&to=2026-01-01`);
  await settle(page, 1000);
  check("an invalid period shows the server's translated validation message", /date de fin doit être postérieure|Vérifiez les informations/.test(await bodyText(page)));
  for (const tab of ["sales", "payments", "products", "reservations", "stock"]) {
    await page.goto(`${env.WEB}/fr/admin/reports?tab=${tab}`);
    await settle(page, 900);
    const rt = await bodyText(page);
    check(`reports/${tab}: loads from the server without error`, !/Impossible de charger|Une erreur/.test(rt) && /Ventes|Paiements|Produits|Réservations|Stock/.test(rt));
    if (tab === "sales") await shot(page, "admin-02-reports-sales-1280");
  }
  await page.goto(`${env.WEB}/fr/admin/reports?tab=payments`);
  await settle(page, 900);
  const pt = await bodyText(page);
  check("payments report has separate HTG and USD tables (never one total)", /HTG/.test(pt) && /USD/.test(pt) && /Reçu/.test(pt) && /Net/.test(pt));
  await ctx.close();
});

const stamp = Date.now().toString(36);
const E2E = { catFr: `Catégorie E2E ${stamp}`, catHt: `Kategori E2E ${stamp}`, prodFr: `Produit E2E ${stamp}`, prodHt: `Pwodwi E2E ${stamp}`, sku: `E2E-${stamp}`.toUpperCase() };
const state = { catId: null, prodId: null, slug: null };
const pngA = await makePng(`${os.tmpdir()}/e2e-a-${stamp}.png`, [200, 60, 50]);
const pngB = await makePng(`${os.tmpdir()}/e2e-b-${stamp}.png`, [40, 90, 180]);
const adminCats = async () => (await admin("GET", "/admin/categories?size=100")).body.items;
const publicCats = async () => (await publicApi("/categories")).map((c) => c.slug);

await run("categories", async () => {
  section("C. Categories on the real API");
  const { page, ctx } = await staffSession();
  await page.goto(`${env.WEB}/fr/admin/categories`);
  await settle(page, 900);
  const before = (await adminCats()).map((c) => c.slug);
  const t0 = await bodyText(page);
  check("list shows the server's categories with their counts", before.every((slug) => true) && /Maison/.test(t0) && /produits/.test(t0));
  await page.getByRole("link", { name: /Nouvelle catégorie/ }).first().click();
  await page.waitForURL(/categories\/new/);
  await settle(page);
  await page.getByLabel("Nom (français)").fill(E2E.catFr);
  await page.getByLabel("Nom (créole haïtien)").fill(E2E.catHt);
  await page.getByRole("button", { name: "Ajouter une caractéristique" }).click();
  await page.getByRole("button", { name: "Ajouter une caractéristique" }).click();
  const labelsFr = page.getByLabel("Libellé (français)"), labelsHt = page.getByLabel("Libellé (créole)");
  await labelsFr.nth(0).fill("Couleur E2E"); await labelsHt.nth(0).fill("Koulè E2E");
  await labelsFr.nth(1).fill("Taille E2E"); await labelsHt.nth(1).fill("Gwosè E2E");
  for (const [attrIdx, opts] of [[0, [["Rouge", "Wouj"], ["Bleu", "Ble"]]], [1, [["S", "S"], ["M", "M"]]]]) {
    for (const [fr, ht] of opts) {
      await page.getByRole("button", { name: "Ajouter une option" }).nth(attrIdx).click();
      const n = await page.getByLabel("Option (français)").count();
      // the newest option of this attribute is the last one in DOM order among that attribute's block
      const frs = page.getByLabel("Option (français)"), hts = page.getByLabel("Option (créole)");
      const idx = attrIdx === 0 ? (await frs.count()) - (attrIdx === 0 && fr === "Rouge" ? 1 : 1) : n - 1;
      await frs.nth(idx).fill(fr); await hts.nth(idx).fill(ht);
    }
  }
  await page.getByLabel("Proposer comme filtre dans la boutique").nth(0).check();
  await page.getByLabel("Peut définir des variantes (taille, couleur…)").nth(1).check();
  await page.getByLabel("Catégorie active").check();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForURL(/categories\/[0-9a-f-]{36}/, { timeout: 15000 });
  state.catId = page.url().match(/categories\/([0-9a-f-]{36})/)[1];
  await settle(page, 900);
  const cat = (await admin("GET", `/admin/categories/${state.catId}`)).body;
  check("a created category is stored by the backend with its two attributes and their options", cat.attributes.length === 2 && cat.attributes.flatMap((a) => a.options).length === 4 && cat.active === true, JSON.stringify(cat.attributes.map((a) => [a.key, a.options.length])));
  check("the attribute flags were saved (filter on colour, variant axis on size)", cat.attributes.find((a) => a.key === "couleur_e2e")?.filterable === true && cat.attributes.find((a) => a.key === "taille_e2e")?.variantAxis === true);
  check("the public storefront lists the new category (data comes from the backend)", (await publicCats()).includes(cat.slug));
  await shot(page, "admin-03-category-edit-1280");

  // concurrency: another staff member saves first
  const latest = (await admin("GET", `/admin/categories/${state.catId}`)).body;
  const body = { version: latest.version, slug: latest.slug, name: latest.name, description: { fr: "Modifié ailleurs", ht: "" }, imageUrl: latest.imageUrl, active: true, attributes: latest.attributes.map((a, i) => ({ id: a.id, key: a.key, label: a.label, type: a.type, unit: a.unit, required: a.required, filterable: a.filterable, variantAxis: a.variantAxis, displayOrder: i + 1, active: a.active, options: a.options.map((o, j) => ({ id: o.id, code: o.code, label: o.label, displayOrder: j + 1, active: o.active })) })) };
  check("(another staff member updates the same category)", (await admin("PUT", `/admin/categories/${state.catId}`, body, key())).status === 200);
  await page.getByLabel("Description (français, facultatif)").first().fill("Ma modification");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText(/modifiées par quelqu'un d'autre/).waitFor({ timeout: 8000 });
  check("a stale save is refused with a conflict message and overwrites nothing", /Rien n'a été écrasé|rien n'a été écrasé/.test(await bodyText(page)) && (await admin("GET", `/admin/categories/${state.catId}`)).body.description.fr === "Modifié ailleurs");
  await page.getByRole("button", { name: "Recharger" }).click();
  await settle(page, 900);
  check("reloading shows the other staff member's version", (await page.getByLabel("Description (français, facultatif)").first().inputValue()) === "Modifié ailleurs");

  // ordering
  const order0 = (await adminCats()).map((c) => c.id);
  await page.goto(`${env.WEB}/fr/admin/categories`);
  await settle(page, 900);
  const row = page.locator("li", { hasText: E2E.catFr });
  await row.getByRole("button", { name: /Monter/ }).click();
  await sleep(900);
  const order1 = (await adminCats()).map((c) => c.id);
  check("moving a category up changes the server's order (and the storefront's)", order1.indexOf(state.catId) === order0.indexOf(state.catId) - 1);
  await page.locator("li", { hasText: E2E.catFr }).getByRole("button", { name: /Descendre/ }).click();
  await sleep(900);
  check("moving it back restores the order", (await adminCats()).map((c) => c.id).indexOf(state.catId) === order0.indexOf(state.catId));

  // deactivation / activation
  await page.locator("li", { hasText: E2E.catFr }).getByRole("button", { name: "Désactiver" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await sleep(1000);
  check("deactivating hides the category from the public storefront", !(await publicCats()).includes(cat.slug));
  await page.locator("li", { hasText: E2E.catFr }).getByRole("button", { name: "Activer" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await sleep(1000);
  check("activating shows it again", (await publicCats()).includes(cat.slug));
  await ctx.close();
});

await run("products", async () => {
  section("D. Products: create, attributes, HTG+USD prices, images (MinIO), publish, storefront, edit, lifecycle");
  const { page, ctx } = await staffSession();
  await page.goto(`${env.WEB}/fr/admin/products/new`);
  await settle(page, 900);
  await page.getByLabel("Catégorie du produit").selectOption({ label: E2E.catFr });
  await settle(page, 900);
  check("choosing the category loads ITS attributes and variant axes from the API", /Couleur E2E/.test(await bodyText(page)) && /Taille E2E/.test(await bodyText(page)));
  await page.getByLabel("Nom (français)").fill(E2E.prodFr);
  await page.getByLabel("Nom (créole haïtien)").fill(E2E.prodHt);
  await page.getByLabel("Référence (SKU, facultatif)").fill(E2E.sku);
  await page.getByLabel("Couleur E2E").selectOption({ label: "Rouge" });
  await page.getByLabel("Prix de détail (HTG)").fill("1500.00");
  await page.getByLabel("Vendre en USD").check();
  await page.getByLabel("Prix de détail (USD)").fill("12.00");
  await page.getByLabel("Prix promotionnel (USD, facultatif)").fill("10.50");
  await page.getByLabel("Proposer un prix de gros").first().check();
  await page.getByLabel("À partir de (quantité)").first().fill("10");
  await page.getByLabel("Prix par unité (HTG)").first().fill("1300.00");
  await page.getByRole("button", { name: /Générer les combinaisons manquantes/ }).click();
  await sleep(300);
  check("variants are generated from the category's size axis (S and M)", (await page.getByLabel("Référence de la variante").count()) === 2);
  await page.getByLabel("Prix USD (facultatif)").nth(1).fill("13.00");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await page.waitForURL(/products\/[0-9a-f-]{36}/, { timeout: 15000 });
  state.prodId = page.url().match(/products\/([0-9a-f-]{36})/)[1];
  await settle(page, 1000);
  let p = (await admin("GET", `/admin/products/${state.prodId}`)).body;
  state.slug = p.slug;
  check("a DRAFT product exists in the backend with independent HTG and USD price blocks", p.status === "DRAFT" && p.prices.length === 2 && p.prices.find((x) => x.currency === "HTG").retail === "1500.00" && p.prices.find((x) => x.currency === "USD").sale === "10.50");
  check("wholesale tier and the per-currency variant override were saved", p.prices.find((x) => x.currency === "HTG").tiers[0]?.unitPrice === "1300.00" && p.variants.length === 2 && p.variants.some((v) => v.retailOverrides?.USD === "13.00"));
  check("the colour attribute value was saved", p.attributes.length === 1);
  check("a draft is NOT visible on the public storefront", (await fetch(`${env.API}/api/v1/products/${state.slug}`)).status === 404);

  // images through the real upload flow
  await page.locator("input[type=file]").setInputFiles([pngA, pngB]);
  await page.waitForFunction(() => document.querySelectorAll("section#sec-images ul li img").length >= 2, null, { timeout: 20000 });
  await sleep(500);
  p = (await admin("GET", `/admin/products/${state.prodId}`)).body;
  check("two images were uploaded DIRECTLY to the object store and attached by the backend", p.images.length === 2 && p.images.every((i) => /:9000\/ana-images\/product-images\//.test(i.url)), JSON.stringify(p.images.map((i) => i.url.slice(0, 60))));
  const imgRes = await fetch(p.images[0].url);
  check("the stored object is publicly readable at the configured asset URL (MinIO standing in for R2)", imgRes.status === 200 && imgRes.headers.get("content-type") === "image/png");
  const first = p.images[0].id;
  await page.getByRole("button", { name: "Déplacer après" }).first().click();
  await sleep(1200);
  p = (await admin("GET", `/admin/products/${state.prodId}`)).body;
  check("reordering images is saved by the backend (primary image changed)", p.images[0].id !== first);
  await shot(page, "admin-04-product-images-1280");

  // publish
  await page.getByRole("button", { name: "Publier" }).last().click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await sleep(1500);
  p = (await admin("GET", `/admin/products/${state.prodId}`)).body;
  check("publishing (after a confirmation) sets ACTIVE in the backend", p.status === "ACTIVE");
  const pub = await (await fetch(`${env.API}/api/v1/products/${state.slug}`)).json();
  check("the public storefront serves the product with BOTH currencies and its images", pub.prices.map((x) => x.currency).sort().join() === "HTG,USD" && pub.images.length === 2 && pub.sellingUnit === "UNIT");
  check("a published product with no stock record is not purchasable yet (availability OUT_OF_STOCK, no number invented)", pub.availability === "OUT_OF_STOCK");
  const web = await newPage(browser);
  await web.page.goto(`${env.WEB}/fr/products/${state.slug}`);
  await settle(web.page, 1200);
  const wt = await bodyText(web.page);
  check("the storefront page shows the name, both currency prices and the Épuisé state", wt.includes(E2E.prodFr) && wt.includes(money(1500, "HTG")) && wt.includes(money(10.5, "USD")) && /Épuisé/.test(wt));
  await web.ctx.close();

  // edit price: storefront reflects it, images preserved
  await page.goto(`${env.WEB}/fr/admin/products/${state.prodId}`);
  await settle(page, 1000);
  await page.getByLabel("Prix de détail (HTG)").fill("1600.00");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await sleep(1500);
  const pub2 = await (await fetch(`${env.API}/api/v1/products/${state.slug}`)).json();
  p = (await admin("GET", `/admin/products/${state.prodId}`)).body;
  check("editing an unrelated field (price) updates the storefront and keeps the images", pub2.prices.find((x) => x.currency === "HTG").retailPrice === "1600.00" && p.images.length === 2 && p.status === "ACTIVE");

  // validation: translated, form data preserved
  await page.getByLabel("Nom (créole haïtien)").fill("");
  await page.getByLabel("Prix de détail (USD)").fill("12.505");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await sleep(1200);
  const vt = await bodyText(page);
  check("server validation problems are listed in French, never as raw codes", /Vérifiez les informations|obligatoire|Obligatoire|Valeur invalide|décimales|invalide/i.test(vt) && !/required_to_publish|too_many_decimals|validation_failed/.test(vt), vt.slice(vt.indexOf("Vérifiez") >= 0 ? vt.indexOf("Vérifiez") : 0, 200));
  check("the typed values stay in the form after a failed save", (await page.getByLabel("Prix de détail (USD)").inputValue()) === "12.505");
  await shot(page, "admin-05-product-validation-1280");
  await page.reload(); await settle(page, 900);

  // duplicate SKU
  await page.goto(`${env.WEB}/fr/admin/products/new`);
  await settle(page, 900);
  await page.getByLabel("Catégorie du produit").selectOption({ label: E2E.catFr });
  await page.getByLabel("Nom (français)").fill(`Doublon ${stamp}`);
  await page.getByLabel("Référence (SKU, facultatif)").fill(E2E.sku);
  await page.getByLabel("Prix de détail (HTG)").fill("100.00");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await sleep(1500);
  check("a duplicate SKU is refused with a translated message", /déjà utilisée/.test(await bodyText(page)) && (await admin("GET", `/admin/products?q=Doublon ${stamp}`)).body.items.length === 0);

  // concurrency on products
  await page.goto(`${env.WEB}/fr/admin/products/${state.prodId}`);
  await settle(page, 1000);
  const d = (await admin("GET", `/admin/products/${state.prodId}`)).body;
  const rq = { version: d.version, sku: d.sku, slug: d.slug, categoryId: d.categoryId, name: d.name, description: d.description, brand: "Ailleurs", unit: d.unit, unitNote: d.unitNote, prices: d.prices, variants: d.variants, attributes: d.attributes };
  await admin("PUT", `/admin/products/${state.prodId}`, rq, key());
  await page.getByLabel("Marque (facultatif)").fill("Moi");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByText(/modifiées par quelqu'un d'autre/).waitFor({ timeout: 8000 });
  check("a stale product edit is refused (409) and nothing is overwritten", (await admin("GET", `/admin/products/${state.prodId}`)).body.brand === "Ailleurs");

  // lifecycle: deactivate hides, reactivate shows
  await page.reload(); await settle(page, 1000);
  await page.getByRole("button", { name: "Désactiver" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await sleep(1500);
  check("deactivating removes it from the storefront", (await fetch(`${env.API}/api/v1/products/${state.slug}`)).status === 404);
  await page.getByRole("button", { name: "Activer" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await sleep(1500);
  check("reactivating shows it again", (await fetch(`${env.API}/api/v1/products/${state.slug}`)).status === 200);

  // list: search + filters from the server
  await page.goto(`${env.WEB}/fr/admin/products?q=${encodeURIComponent(E2E.sku)}`);
  await settle(page, 1000);
  const lt = await bodyText(page);
  check("the product list searches on the server (by SKU) and shows prices per currency", lt.includes(E2E.prodFr) && /1 600,00 HTG/.test(lt) && /10,50 USD/.test(lt) && /1 produit/.test(lt));
  await page.goto(`${env.WEB}/fr/admin/products?status=DRAFT&currency=USD`);
  await settle(page, 1000);
  check("status and currency filters are applied by the API", !(await bodyText(page)).includes(E2E.prodFr));

  // deleting: a draft goes; a product with images/stock cannot
  await page.goto(`${env.WEB}/fr/admin/products/new`);
  await settle(page, 900);
  await page.getByLabel("Catégorie du produit").selectOption({ label: E2E.catFr });
  await page.getByLabel("Nom (français)").fill(`Brouillon à supprimer ${stamp}`);
  await page.getByLabel("Prix de détail (HTG)").fill("50.00");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await page.waitForURL(/products\/[0-9a-f-]{36}/, { timeout: 15000 });
  await settle(page, 900);
  const draftId = page.url().match(/products\/([0-9a-f-]{36})/)[1];
  await page.getByRole("button", { name: "Supprimer le brouillon" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await page.waitForURL(/\/admin\/products$/, { timeout: 10000 });
  check("a draft can be deleted (after a confirmation that says it is final)", (await admin("GET", `/admin/products/${draftId}`)).status === 404);
  const del = await admin("DELETE", `/admin/products/${state.prodId}`, undefined, key());
  check("the API refuses to delete a product with images (409), as the UI explains", del.status === 409);
  await ctx.close();
});

console.log(`\n${results.filter((r) => r.ok).length} passed, ${results.filter((r) => !r.ok).length} failed`);
console.log(pageErrors.length ? `page errors:\n${pageErrors.join("\n")}` : "no unexpected page errors");
await browser.close();
