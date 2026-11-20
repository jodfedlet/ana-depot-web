/**
 * CUSTOMER CANCELLATION browser suite (D7, owner-approved) — LOCAL STACK: real web build, real API, local Supabase for the staff token. A customer cancels their own reservation from the
 * tracking page until the store starts preparing it; the SERVER decides (`canCancel`), the page only asks. Run with `npm run e2e:cancel` (setup as e2e/storefront/README.md).
 */
import crypto from "node:crypto";
import { admin, bodyText, check, env, key, launch, newPage, overflow, pageErrors, productBySlug, results, section, settle, shot, stockOf } from "./lib.mjs";

const browser = await launch();
const run = async (name, fn) => { try { await fn(); } catch (e) { check(`${name}: script`, false, `${String(e.message).split("\n")[0]} @ ${(String(e.stack).match(/cancel\.mjs:(\d+)/) ?? [])[1] ?? "?"}`); } };
const product = await productBySlug("tapis-de-sol");
let seq = 0;
async function reserve() {
  const phone = `38${String(Date.now()).slice(-5)}${(seq++ % 10)}`;
  const r = await fetch(`${env.API}/api/v1/reservations`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ lines: [{ productId: product.id, quantity: 2, currency: "HTG" }], contact: { firstName: "Annule", lastName: "Test", dialCode: "+509", phone, email: `cancel-${Date.now()}-${seq}@example.test` }, locale: "fr", acknowledgedTerms: true }) });
  const view = await r.json();
  if (r.status !== 201) throw new Error(`reserve ${r.status}`);
  return { ...view, phone };
}
async function open(page, lang, v) {
  await page.goto(`${env.WEB}/${lang}/reservations/${v.reference}`); await settle(page, 800);
  await page.getByLabel(lang === "fr" ? "Téléphone" : /Telefòn|Nimewo/).fill(v.phone);
  await page.getByRole("button", { name: lang === "fr" ? "Afficher" : /Montre|Afiche/ }).click();
  await page.getByRole("heading", { level: 1 }).filter({ hasText: v.reference }).waitFor({ timeout: 15000 });
  await settle(page, 600);
}

await run("pending", async () => {
  section("1. A customer cancels a pending reservation (390 px and 1280 px)");
  for (const width of [390, 1280]) {
    const v = await reserve();
    const before = await stockOf(product.id);
    const { ctx, page } = await newPage(browser, { width });
    await open(page, "fr", v);
    check(`${width}px: the page offers to cancel, saying until when`, (await page.getByRole("button", { name: "Annuler ma réservation" }).count()) === 1 && /tant que le magasin n'a pas commencé/.test(await bodyText(page)));
    await page.getByRole("button", { name: "Annuler ma réservation" }).click();
    const dialog = page.getByRole("dialog");
    check(`${width}px: cancelling needs a reason (the button stays disabled without one)`, await dialog.getByRole("button", { name: "Annuler la réservation" }).isDisabled());
    await dialog.getByLabel("Pourquoi annulez-vous ?").fill("Je n'en ai plus besoin");
    await shot(page, `cancel-dialog-${width}`);
    await dialog.getByRole("button", { name: "Annuler la réservation" }).click();
    await page.getByText("Annulée").first().waitFor({ timeout: 15000 });
    await settle(page, 500);
    const t = await bodyText(page);
    check(`${width}px: the page shows the cancelled state from the server's reply and no cancel button any more`, /Annulée/.test(t) && (await page.getByRole("button", { name: "Annuler ma réservation" }).count()) === 0);
    check(`${width}px: no horizontal overflow`, (await overflow(page)) <= 0, String(await overflow(page)));
    await shot(page, `cancel-done-${width}`);
    const after = await stockOf(product.id);
    check(`${width}px: the held stock is back (server-side)`, after.reserved === before.reserved - 2, JSON.stringify({ before: before.reserved, after: after.reserved }));
    const detail = (await admin("GET", `/admin/reservations/${v.id}`)).body;
    const last = detail.history.at(-1);
    check(`${width}px: the store sees WHO cancelled and why`, last.to === "CANCELLED" && last.actor.kind === "CUSTOMER" && last.reasonNote === "Je n'en ai plus besoin");
    await ctx.close();
  }
});

await run("confirmed-and-ready", async () => {
  section("2. Confirmed: still allowed. Ready: the customer is told to contact the store");
  const v = await reserve();
  await admin("POST", `/admin/reservations/${v.id}/accept`, undefined, key());
  const { ctx, page } = await newPage(browser, { width: 1280 });
  await open(page, "fr", v);
  check("confirmed: the cancel button is still there", (await page.getByRole("button", { name: "Annuler ma réservation" }).count()) === 1);
  await admin("POST", `/admin/reservations/${v.id}/ready`, {}, key());
  await page.reload(); await settle(page, 1200);
  if ((await page.getByLabel("Téléphone").count()) > 0) await open(page, "fr", v);
  const t = await bodyText(page);
  check("ready: no cancel button (the store is preparing/has prepared it)", (await page.getByRole("button", { name: "Annuler ma réservation" }).count()) === 0 && /Prête à retirer/.test(t));
  const refused = await fetch(`${env.API}/api/v1/reservations/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: v.reference, phone: v.phone, reason: "trop tard" }) });
  check("and the server refuses it too (409 cancellation_not_allowed)", refused.status === 409 && (await refused.json()).code === "cancellation_not_allowed");
  await ctx.close();
});

await run("creole", async () => {
  section("3. Haitian Creole");
  const v = await reserve();
  const { ctx, page } = await newPage(browser, { width: 390 });
  await page.goto(`${env.WEB}/ht/reservations/${v.reference}`); await settle(page, 800);
  await page.locator("input[type=tel]").fill(v.phone);
  await page.locator("form button[type=submit]").click();
  await page.getByRole("button", { name: "Anile rezèvasyon mwen" }).waitFor({ timeout: 15000 });
  check("the cancel button and its explanation exist in Haitian Creole", /Posib toutotan magazen an poko kòmanse/.test(await bodyText(page)));
  await ctx.close();
});

check("no unexpected browser errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
