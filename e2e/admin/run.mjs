/**
 * ADMINISTRATION browser suite — LOCAL STACK (real Spring Boot API, local Supabase Auth + Mailpit, MinIO standing in for R2). Not a hosted-Supabase test, not a real-R2 test.
 * Setup is the same as e2e/storefront/README.md (seed + staff user); run with `npm run e2e:admin`.
 */
import { admin, bodyText, check, env, key, launch, newPage, overflow, pageErrors, results, section, settle, shot, sleep, uniqPhone, money } from "../storefront/lib.mjs";

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

console.log(`\n${results.filter((r) => r.ok).length} passed, ${results.filter((r) => !r.ok).length} failed`);
console.log(pageErrors.length ? `page errors:\n${pageErrors.join("\n")}` : "no unexpected page errors");
await browser.close();
