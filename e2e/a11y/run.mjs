/**
 * ACCESSIBILITY browser suite (axe-core, WCAG 2.0/2.1/2.2 A + AA rules, colour contrast included) — LOCAL STACK, the same setup as e2e/storefront/README.md (seeded catalog, staff user,
 * API with ANA_STAFF_REQUIRE_MFA off). Scans every main storefront, account, authentication and administration screen at 390 px and 1280 px, in French and Haitian Creole. Run: `npm run e2e:a11y`.
 * Automated rules find roughly a third of real accessibility problems: a green run is a floor, not a certificate (keyboard and screen-reader review remain manual).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { admin, check, env, launch, newPage, publicApi, results, section, settle } from "../storefront/lib.mjs";

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SK = process.env.SUPABASE_LOCAL_SECRET_KEY;
const browser = await launch();

async function scan(page, label) {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate((tags) => axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] }), TAGS);
  const v = res.violations.map((x) => `${x.id} (${x.impact}) x${x.nodes.length}: ${x.nodes[0].target.join(" ")}`);
  check(`${label}`, v.length === 0, v.slice(0, 3).join(" | "));
  return v.length;
}
async function visit(ctxPage, url, label) {
  await ctxPage.goto(`${env.WEB}${url}`, { waitUntil: "domcontentloaded" });
  await settle(ctxPage, 900);
  return scan(ctxPage, label);
}

const products = (await publicApi("/products?size=3")).items ?? [];
const categories = (await publicApi("/categories")).items ?? (await publicApi("/categories")) ?? [];
const productSlug = products[0]?.slug;
const categorySlug = Array.isArray(categories) ? categories[0]?.slug : undefined;
const reference = (await admin("GET", "/admin/reservations?size=1")).body?.items?.[0]?.reference;

const storefront = ["", "/products", `/products/${productSlug}`, `/categories/${categorySlug}`, "/search?q=a", "/cart", "/reserve", "/reservations", "/info/pickup", "/info/contact", "/info/terms", "/info/faq",
  "/auth/login", "/auth/sign-up", "/auth/forgot-password", "/payment/cancelled?reference=ANA-AAAAAA", "/missing"];
const account = ["/account", "/account/profile", "/account/reservations", "/account/join-team"];
const adminPages = ["/admin", "/admin/reservations", reference ? `/admin/reservations/${reference}` : null, "/admin/payments", "/admin/products", "/admin/products/new", "/admin/categories", "/admin/categories/new",
  "/admin/inventory", "/admin/customers", "/admin/reports", "/admin/team", "/admin/settings", "/admin/pickup-settings"].filter(Boolean);

for (const [lang, width, device] of [["fr", 1280, "desktop"], ["fr", 390, "mobile"], ["ht", 1280, "desktop"], ["ht", 390, "mobile"]]) {
  section(`Storefront — ${lang}, ${device} (${width}px)`);
  const { ctx, page } = await newPage(browser, { width, height: width > 600 ? 900 : 844 });
  for (const p of storefront) await visit(page, `/${lang}${p}`, `${lang}/${device} ${p || "/"}`);
  await ctx.close();
}

if (SK) {
  for (const [lang, width, device] of [["fr", 1280, "desktop"], ["fr", 390, "mobile"], ["ht", 390, "mobile"]]) {
    section(`Account — ${lang}, ${device}`);
    const email = `a11y-${Date.now()}-${lang}-${width}@example.test`;
    await fetch(`${env.SB}/auth/v1/admin/users`, { method: "POST", headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Str0ng-pass-1", email_confirm: true }) });
    const { ctx, page } = await newPage(browser, { width, height: width > 600 ? 900 : 844 });
    await page.goto(`${env.WEB}/${lang}/auth/login`); await settle(page);
    await page.getByLabel(lang === "fr" ? "E-mail" : /imèl|e-mail/i).fill(email);
    await page.locator('input[type="password"]').first().fill("Str0ng-pass-1");
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((u) => !/auth\/login/.test(u.pathname), { timeout: 20000 });
    for (const p of account) await visit(page, `/${lang}${p}`, `${lang}/${device} ${p}`);
    await ctx.close();
  }
} else console.log("SKIP  account pages (set SUPABASE_LOCAL_SECRET_KEY of the LOCAL stack)");

for (const [lang, width, device] of [["fr", 1280, "desktop"], ["fr", 390, "mobile"], ["ht", 1280, "desktop"], ["ht", 390, "mobile"]]) {
  section(`Administration — ${lang}, ${device}`);
  const { ctx, page } = await newPage(browser, { width, height: width > 600 ? 900 : 844 });
  await page.goto(`${env.WEB}/${lang}/auth/login?next=%2Fadmin`); await settle(page);
  await page.locator('input[type="email"], input[name="email"]').first().fill(env.STAFF_EMAIL);
  await page.locator('input[type="password"]').first().fill(env.STAFF_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/admin/, { timeout: 20000 });
  for (const p of adminPages) await visit(page, `/${lang}${p}`, `${lang}/${device} ${p}`);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} clean, ${failed.length} with violations (${results.length} page scans)`);
process.exit(failed.length ? 1 : 0);
