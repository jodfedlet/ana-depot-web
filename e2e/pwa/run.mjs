/**
 * PWA browser suite (production build, real Chromium): manifest, installability, service worker lifecycle, offline behaviour, cache isolation,
 * logout purge, update flow. LOCAL-STACK verification (local Supabase + real API + MinIO); not Safari, not a physical phone.
 *
 *   PWA_REBUILD_CMD="bash rebuild-v2.sh"  optional: rebuilds + restarts the server as a NEW version (exit 0 when ready) for the v1 -> v2 update check.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { check, env, launch, newPage, pageErrors, section, settle, shot, sleep, overflow, publicApi, bodyText } from "../storefront/lib.mjs";

const chromiumExe = process.env.CHROMIUM_PATH ?? (() => { const base = `${os.homedir()}/.cache/ms-playwright`; return `${base}/${fs.readdirSync(base).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`; })();
const browser = await launch();
const ENV_VERSION = process.env.PWA_EXPECT_VERSION ?? "v1";
const cspErrors = [];
const watch = (page) => page.on("console", (m) => { if (/Content.Security.Policy|violates the following/i.test(m.text())) cspErrors.push(`${page.url()} ${m.text().slice(0, 200)}`); });
const cacheDump = (page) => page.evaluate(async () => {
  const out = {};
  for (const name of await caches.keys()) {
    const c = await caches.open(name);
    out[name] = await Promise.all((await c.keys()).map(async (r) => ({ url: r.url, auth: r.headers.has("authorization") })));
  }
  return out;
});
const allEntries = (dump) => Object.entries(dump).flatMap(([name, list]) => list.map((e) => ({ ...e, name })));
const controlled = (page) => page.evaluate(() => !!navigator.serviceWorker.controller);
async function waitControlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await controlled(page))) { await page.reload(); await settle(page, 1200); }
  for (let i = 0; i < 20 && !(await controlled(page)); i++) await sleep(300);
  return controlled(page);
}

// a simple product (no variants to pick) that is in stock, so "add to cart" is one click
const simple = (await publicApi("/products?size=50&inStock=true")).items.find((p) => !(p.variants ?? []).length && (p.prices ?? []).length);
if (!simple) { console.error("No in-stock product without variants: seed one (e2e/storefront/seed.py)."); process.exit(2); }
const slug = simple.slug;

// ---------------------------------------------------------------------------------------------------------------------------------------------
section("A. Manifest and icons");
{
  const res = await fetch(`${env.WEB}/manifest.webmanifest`);
  const m = await res.json();
  check("manifest is served as JSON", res.ok && /json/.test(res.headers.get("content-type") ?? ""), res.headers.get("content-type"));
  check("name / short_name / description present", !!m.name && !!m.short_name && !!m.description, `${m.name} / ${m.short_name}`);
  check("display standalone, scope and start_url under the origin", m.display === "standalone" && m.scope === "/" && m.start_url === "/", `${m.display} ${m.scope} ${m.start_url}`);
  check("theme and background colours are set", /^#[0-9a-f]{6}$/i.test(m.theme_color) && /^#[0-9a-f]{6}$/i.test(m.background_color), `${m.theme_color} ${m.background_color}`);
  const sizes = {};
  for (const icon of m.icons) {
    const r = await fetch(new URL(icon.src, env.WEB));
    const buf = Buffer.from(await r.arrayBuffer());
    const isPng = buf.subarray(1, 4).toString() === "PNG";
    const w = isPng ? buf.readUInt32BE(16) : 0, h = isPng ? buf.readUInt32BE(20) : 0;
    sizes[`${icon.purpose}:${icon.sizes}`] = r.ok && isPng && `${w}x${h}` === icon.sizes;
  }
  check("icons: 192 any, 512 any, 512 maskable are real PNGs of the declared size", sizes["any:192x192"] && sizes["any:512x512"] && sizes["maskable:512x512"], JSON.stringify(sizes));
  const html = await (await fetch(`${env.WEB}/fr`)).text();
  check("home links the manifest, an apple-touch icon and a theme colour", /rel="manifest"/.test(html) && /apple-touch-icon|apple-icon/.test(html) && /name="theme-color"/.test(html));
  const apple = html.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*rel="apple-touch-icon"/);
  const aHref = apple?.[1] ?? apple?.[2];
  const ar = aHref ? await fetch(new URL(aHref, env.WEB)) : null;
  check("apple-touch icon resolves to an image", !!ar?.ok && /image\/png/.test(ar.headers.get("content-type") ?? ""), aHref);
  const sw = await fetch(`${env.WEB}/sw.js`);
  const swText = await sw.text();
  check("/sw.js: JavaScript, never cached by the browser, whole-origin scope", /javascript/.test(sw.headers.get("content-type") ?? "") && /no-cache|no-store|max-age=0/.test(sw.headers.get("cache-control") ?? "") && sw.headers.get("service-worker-allowed") === "/", sw.headers.get("cache-control"));
  check("/sw.js carries the build version", swText.includes(`"version":"${ENV_VERSION}"`), swText.match(/"version":"[^"]+"/)?.[0]);
  check("/sw.js carries no secret-looking values", !/(secret|service_role|eyJ[A-Za-z0-9_-]{20,}|sb_secret)/i.test(swText));
  const css = await fetch(`${env.WEB}/offline.html`);
  check("offline page is static, noindex, bilingual", css.ok && /noindex/.test(await css.clone().text()) && /Hors connexion/.test(await css.text()));
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
section("B. Service worker lifecycle and installability (desktop Chromium, production build)");
const { ctx, page } = await newPage(browser);
watch(page);
await page.goto(`${env.WEB}/fr`);
await settle(page, 1500);
check("service worker registers and activates", await page.evaluate(async () => {
  const r = await navigator.serviceWorker.ready;
  for (let i = 0; i < 50 && r.active?.state !== "activated"; i++) await new Promise((x) => setTimeout(x, 100));
  return r.active?.state === "activated";
}));
check("the page becomes controlled (after the first reload)", await waitControlled(page));
const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { scope: r.scope, script: r.active?.scriptURL }; });
check("registration scope is the origin, script is /sw.js", reg.scope === `${env.WEB}/` && reg.script === `${env.WEB}/sw.js`, JSON.stringify(reg));
{
  // A Playwright context is "incognito" (Chromium then reports `in-incognito`): use a persistent profile for the installability check.
  const { chromium } = await import("playwright-core");
  const dir = (await import("node:fs")).mkdtempSync((await import("node:os")).tmpdir() + "/pwa-profile-");
  const pc = await chromium.launchPersistentContext(dir, { executablePath: chromiumExe, args: ["--no-sandbox"], headless: true });
  const pp = pc.pages()[0] ?? (await pc.newPage());
  await pp.goto(`${env.WEB}/fr`); await settle(pp, 1500);
  await pp.evaluate(() => navigator.serviceWorker.ready); await sleep(1000);
  const cdp = await pc.newCDPSession(pp);
  const r = await cdp.send("Page.getInstallabilityErrors").catch((e) => ({ err: String(e) }));
  check("Chromium reports no installability errors", Array.isArray(r.installabilityErrors) && r.installabilityErrors.length === 0, JSON.stringify(r.installabilityErrors ?? r.err));
  const mf = await cdp.send("Page.getAppManifest").catch(() => null);
  check("Chromium parsed the manifest without errors", !!mf && (mf.errors ?? []).length === 0, JSON.stringify(mf?.errors ?? []));
  await pc.close();
}
// visit public pages WHILE controlled so they are stored
await page.goto(`${env.WEB}/fr/products`); await settle(page, 1200);
await page.goto(`${env.WEB}/fr/products/${slug}`); await settle(page, 1500);
const productName = (await page.locator("h1").first().innerText()).trim();
await page.goto(`${env.WEB}/ht`); await settle(page, 1200);
await page.goto(`${env.WEB}/fr`); await settle(page, 1200);
let dump = await cacheDump(page);
const names = Object.keys(dump);
check("caches are versioned (ana-<version>-<kind>) and only this version exists", names.length > 0 && names.every((n) => n.startsWith(`ana-${ENV_VERSION}-`)), names.join(", "));
const urls = allEntries(dump).map((e) => e.url);
check("offline notice files, home, catalog, the visited product and hashed assets are stored", ["/offline.html", "/fr", "/fr/products", `/fr/products/${slug}`, "/_next/static/"].every((p) => urls.some((u) => u.includes(p))), `${urls.length} entries`);
check("the public catalog JSON read for the product page is stored in the api cache", (dump[`ana-${ENV_VERSION}-api`] ?? []).some((e) => /\/api\/v1\/(products|categories)/.test(e.url)));

// ---------------------------------------------------------------------------------------------------------------------------------------------
section("C. Offline behaviour (public pages, cart estimate, transactions)");
// put one item in the cart while online
await page.goto(`${env.WEB}/fr/products/${slug}`); await settle(page, 1200);
await page.getByRole("button", { name: /Ajouter au panier/ }).first().click();
await sleep(600);
await page.goto(`${env.WEB}/fr/cart`); await settle(page, 1200);
const cartOnline = await bodyText(page);
check("online: the cart lists the product and shows no offline notice", cartOnline.includes(productName) && !/Hors connexion/.test(cartOnline));
await ctx.setOffline(true);
await page.goto(`${env.WEB}/fr/cart`); await settle(page, 800);
let t = await bodyText(page);
check("offline: the cart still opens with its lines (saved on this device)", t.includes(productName), t.slice(0, 80));
check("offline: the cart says prices and availability were not refreshed (estimate)", /estimation/i.test(t) && /pas été actualisés/.test(t));
check("offline: the offline strip is visible", await page.getByTestId("offline-strip").isVisible());
check("offline: the reserve button is disabled and says a connection is required", (await page.getByRole("link", { name: /Réserver/ }).first().getAttribute("aria-disabled")) === "true" && /Réserver nécessite une connexion/.test(t));
await shot(page, "pwa-offline-cart-desktop");
await page.goto(`${env.WEB}/fr`); await settle(page, 800);
t = await bodyText(page);
check("offline: the home page opens from the saved copy", t.length > 200 && !/Vous n'avez pas de connexion/.test(t) && await page.getByTestId("offline-strip").isVisible());
await page.goto(`${env.WEB}/fr/products/${slug}`); await settle(page, 800);
check("offline: a product page visited before opens, with its name", (await bodyText(page)).includes(productName));
// pages never visited, and every transactional/private page: the notice, with HTTP 503, never a stale page
for (const [label, path] of [["never-visited public page", "/fr/info/never-visited"], ["reservation form", "/fr/reserve"], ["tracking", "/fr/reservations"], ["administration", "/fr/admin"], ["account", "/fr/account"], ["sign-in", "/fr/auth/login"]]) {
  const visit = () => page.goto(`${env.WEB}${path}`).catch((e) => { console.log("   goto error:", String(e).slice(0, 160)); return null; });
  const r = (await visit()) ?? (await visit()); // a navigation interrupted by the previous notice page's own retry is repeated once
  const body = await bodyText(page);
  const ht = await page.locator("section.ht").textContent().catch(() => "");
  check(`offline: ${label} shows the offline notice (503, French shown, Creole present), not a page`, r?.status() === 503 && /Vous êtes hors connexion/.test(body) && /Ou pa gen koneksyon/.test(ht ?? ""), `${r?.status()}`);
}
check("offline: the notice states reservations/tracking/sign-in/admin are unavailable and nothing is queued", /impossible/.test(await bodyText(page)) && /Rien n'est envoyé en attente/.test(await bodyText(page)));
await shot(page, "pwa-offline-notice");
// writes are never faked: a reservation POST while offline fails, nothing is stored
const post = await page.evaluate(async (api) => { try { const r = await fetch(`${api}/api/v1/reservations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); return `status ${r.status}`; } catch { return "network error"; } }, env.API);
check("offline: a reservation POST fails (no queue, no fake success)", post === "network error", post);
dump = await cacheDump(page);
check("offline: no cache holds a reservation or lookup request", !allEntries(dump).some((e) => /\/reservations/.test(e.url)));
await ctx.setOffline(false);
await page.goto(`${env.WEB}/fr/cart`); await settle(page, 1500);
t = await bodyText(page);
check("back online: the offline strip and the estimate notice are gone", !(await page.getByTestId("offline-strip").isVisible().catch(() => false)) && !/estimation enregistrée/.test(t));

// ---------------------------------------------------------------------------------------------------------------------------------------------
section("D. Cache isolation: signed-in staff traffic is never stored");
await page.goto(`${env.WEB}/fr/auth/login?next=%2Fadmin`); await settle(page);
await page.getByLabel("E-mail").fill(env.STAFF_EMAIL);
await page.getByLabel("Mot de passe", { exact: true }).fill(env.STAFF_PASSWORD);
await page.getByRole("button", { name: "Se connecter", exact: true }).click();
await page.waitForURL(/\/fr\/admin/, { timeout: 20000 });
await settle(page, 1500);
for (const p of ["/fr/admin/products", "/fr/admin/reservations", "/fr/admin/inventory", "/fr/admin/reports?tab=sales", "/fr/account", "/fr/reservations", "/fr/reserve"]) { await page.goto(`${env.WEB}${p}`); await settle(page, 900); }
await page.goto(`${env.WEB}/fr/admin`); await settle(page, 1200);
check("signed-in staff sees the dashboard (worker did not break the gate)", /Tableau de bord/.test(await bodyText(page)));
dump = await cacheDump(page);
const entries = allEntries(dump);
const bad = entries.filter((e) => /\/admin|\/account|\/auth\/|\/reserve|\/reservations|supabase|:54321|\/api\/v1\/(me|admin|reservations|uploads)|token|\/api\/v1\/.*\?.*(phone|reference)/i.test(e.url) || e.auth);
check("no cache entry is an admin/account/auth/reservation/Supabase/me URL or carries Authorization", bad.length === 0, bad.map((b) => b.url).join(" | "));
check("only the expected cache kinds exist", Object.keys(dump).every((n) => /^ana-[^-]+-(shell|static|pages|api|images)$/.test(n)), Object.keys(dump).join(","));
await ctx.setOffline(true);
const adminOffline = await page.goto(`${env.WEB}/fr/admin/products`).catch(() => null);
const adminBody = await bodyText(page);
check("offline: staff pages are NOT served from a cache (notice, 503, no admin content)", adminOffline?.status() === 503 && /hors connexion/i.test(adminBody) && !/Nouveau produit|Tableau de bord/.test(adminBody), `${adminOffline?.status()}`);
await ctx.setOffline(false);
await page.goto(`${env.WEB}/fr/admin`); await settle(page, 1200);

section("E. Sign-out (and sign-out in another tab) purge the saved pages and catalog answers");
const before = await cacheDump(page);
check("before sign-out the page/catalog caches hold entries", (before[`ana-${ENV_VERSION}-pages`] ?? []).length > 0 && (before[`ana-${ENV_VERSION}-api`] ?? []).length > 0, `pages ${(before[`ana-${ENV_VERSION}-pages`] ?? []).length}, api ${(before[`ana-${ENV_VERSION}-api`] ?? []).length}`);
const tab2 = await ctx.newPage(); watch(tab2);
await tab2.goto(`${env.WEB}/fr/admin`); await settle(tab2, 1500);
// sign out from the admin menu
const signOut = async (p) => {
  await p.getByRole("button", { name: "Compte", exact: true }).click();
  await p.getByRole("button", { name: "Se déconnecter" }).click();
};
await signOut(tab2);
await tab2.waitForURL(/auth\/login|\/fr(\/)?$/, { timeout: 20000 }).catch(() => {});
await sleep(2500);
const afterOther = await cacheDump(page);
const keep = (d, kind) => (d[`ana-${ENV_VERSION}-${kind}`] ?? []).map((e) => e.url);
check("sign-out (seen from another tab) emptied what the page and catalog caches held before", !keep(before, "pages").some((u) => keep(afterOther, "pages").includes(u) && /products\/|\/fr\/cart/.test(u)) && !keep(before, "api").some((u) => keep(afterOther, "api").includes(u) && /products/.test(u)), JSON.stringify(Object.fromEntries(Object.entries(afterOther).map(([k, v]) => [k, v.length]))));
check("hashed build assets and the offline notice remain (they hold nothing private)", (afterOther[`ana-${ENV_VERSION}-static`]?.length ?? 0) > 0 && (afterOther[`ana-${ENV_VERSION}-shell`]?.length ?? 0) >= 3);
await page.reload(); await settle(page, 1500);
check("after sign-out the staff area asks to sign in again", /auth\/login/.test(page.url()) || /Se connecter/.test(await bodyText(page)), page.url());

// ---------------------------------------------------------------------------------------------------------------------------------------------
section("F. Install guidance");
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage(); watch(p);
  await p.addInitScript(() => { try { if (!localStorage.getItem("ana.pwa.visits")) localStorage.setItem("ana.pwa.visits", "1"); } catch {} });
  await p.goto(`${env.WEB}/fr/products`); await settle(p, 1500);   // visit #2 counted now (1 + this session)
  await p.evaluate(() => window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) })));
  await sleep(500);
  check("install card appears after the 2nd visit when the browser offers installation", await p.getByTestId("install-card").isVisible());
  check("install card does not overflow the 390px viewport", (await overflow(p)) <= 0, String(await overflow(p)));
  await shot(p, "pwa-install-card-390");
  await p.getByRole("button", { name: "Pas maintenant" }).click(); await sleep(300);
  check("'Pas maintenant' hides it and remembers for later", !(await p.getByTestId("install-card").isVisible().catch(() => false)) && !!(await p.evaluate(() => localStorage.getItem("ana.pwa.install-dismissed"))));
  await p.reload(); await settle(p, 1000);
  await p.evaluate(() => window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) })));
  await sleep(400);
  check("it stays away after a reload (dismissal remembered)", !(await p.getByTestId("install-card").isVisible().catch(() => false)));
  await p.evaluate(() => { localStorage.removeItem("ana.pwa.install-dismissed"); });
  await p.goto(`${env.WEB}/fr/reserve`); await settle(p, 900);
  await p.evaluate(() => window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) })));
  await sleep(400);
  check("it never interrupts the reservation flow", !(await p.getByTestId("install-card").isVisible().catch(() => false)));
  await c.close();

  const first = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p1 = await first.newPage();
  await p1.goto(`${env.WEB}/fr/products`); await settle(p1, 1000);
  await p1.evaluate(() => window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) })));
  await sleep(400);
  check("not offered on the very first visit", !(await p1.getByTestId("install-card").isVisible().catch(() => false)));
  await first.close();

  const ios = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const pi = await ios.newPage();
  await pi.addInitScript(() => { try { localStorage.setItem("ana.pwa.visits", "2"); } catch {} });
  await pi.goto(`${env.WEB}/fr/products`); await settle(pi, 1500);
  check("iPhone Safari user agent gets the 'Add to Home Screen' hint (simulated UA; real Safari not tested)", await pi.getByTestId("ios-hint").isVisible().catch(() => false));
  await shot(pi, "pwa-ios-hint-390");
  await ios.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
section("G. Mobile 390px, Haitian Creole and slow network");
{
  const mc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mc.newPage(); watch(mp);
  await mp.goto(`${env.WEB}/ht/products`); await settle(mp, 1500);
  await waitControlled(mp);
  await mp.goto(`${env.WEB}/ht/products/${slug}`); await settle(mp, 1500);
  await mp.getByRole("button", { name: /Ajoute nan panye|Mete nan panye|panye/i }).first().click().catch(() => {});
  await mp.goto(`${env.WEB}/ht/cart`); await settle(mp, 1200);
  await mc.setOffline(true);
  await mp.goto(`${env.WEB}/ht/cart`); await settle(mp, 800);
  const ht = await bodyText(mp);
  check("Creole offline cart: strip + estimate notice in Creole, no French leak", /koneksyon/i.test(ht) && !/Vous êtes hors connexion|estimation enregistrée/.test(ht), ht.slice(0, 100));
  check("offline cart does not overflow at 390px", (await overflow(mp)) <= 0, String(await overflow(mp)));
  await shot(mp, "pwa-offline-cart-ht-390");
  await mp.goto(`${env.WEB}/ht/admin`).catch(() => {});
  check("Creole offline notice for private pages", /Ou pa gen koneksyon/.test(await bodyText(mp)));
  await shot(mp, "pwa-offline-notice-390");
  await mc.setOffline(false);
  await mc.close();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
section("H. Update flow: new build while a tab is open");
if (process.env.PWA_REBUILD_CMD && process.env.PWA_EXPECT_NEXT) {
  const uc = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const up = await uc.newPage(); watch(up);
  await up.goto(`${env.WEB}/fr/products`); await settle(up, 1500);
  await waitControlled(up);
  await up.goto(`${env.WEB}/fr`); await settle(up, 1200);
  const v1 = Object.keys(await cacheDump(up));
  check("v1 caches exist before the new build", v1.length > 0 && v1.every((n) => n.startsWith(`ana-${ENV_VERSION}-`)), v1.join(","));
  execSync(process.env.PWA_REBUILD_CMD, { stdio: "inherit", timeout: 560000 });
  await up.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await sleep(4000);
  const next = process.env.PWA_EXPECT_NEXT;
  const wait = await up.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r.waiting, active: r.active?.state }; });
  check("the new worker installs and WAITS (the open tab is not swapped under the user)", wait.waiting, JSON.stringify(wait));
  const mid = Object.keys(await cacheDump(up));
  check("while waiting, the old version's caches are still used", mid.some((n) => n.startsWith(`ana-${ENV_VERSION}-`)) && mid.some((n) => n.startsWith(`ana-${next}-`)), mid.join(","));
  check("the page offers 'new version available — refresh'", await up.getByTestId("update-card").isVisible({ timeout: 8000 }).catch(() => false));
  await shot(up, "pwa-update-card-desktop");
  await up.getByRole("button", { name: "Actualiser" }).click();
  await up.waitForLoadState("load"); await sleep(3500); await settle(up, 1500);
  const after = Object.keys(await cacheDump(up));
  check("after refreshing, only the new version's caches remain (old ones deleted)", after.length > 0 && after.every((n) => n.startsWith(`ana-${next}-`)), after.join(","));
  const swNow = await up.evaluate(async () => (await (await fetch("/sw.js", { cache: "no-store" })).text()).match(/"version":"[^"]+"/)?.[0]);
  check("/sw.js now reports the new version and the tab is controlled by it", swNow === `"version":"${next}"` && await controlled(up), swNow);
  check("the update card is gone after refreshing", !(await up.getByTestId("update-card").isVisible().catch(() => false)));
  await uc.close();
} else {
  console.log("SKIP  update flow (set PWA_REBUILD_CMD and PWA_EXPECT_NEXT)");
}

section("I. Console");
check("no Content-Security-Policy violation in any flow", cspErrors.length === 0, cspErrors.slice(0, 3).join(" | "));
const noise = pageErrors.filter((e) => !/Failed to load resource|status of 503|net::ERR_INTERNET_DISCONNECTED/i.test(e));
check("no unexpected page errors", noise.length === 0, noise.slice(0, 3).join(" | "));

await browser.close();
const failed = (await import("../storefront/lib.mjs")).results.filter((r) => !r.ok);
console.log(`\n${(await import("../storefront/lib.mjs")).results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
