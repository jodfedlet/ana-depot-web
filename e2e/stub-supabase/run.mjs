/**
 * STUB-BASED browser suite (NOT real Supabase): the built web app talks to ./stub.mjs, a tiny fake of the Supabase Auth REST API + GET /api/v1/me.
 * It exists to reach states the real stack cannot produce on demand (HTTP 429, a network failure) and to check the block UI strings in fr AND ht.
 * Real-behavior claims belong to ../real-supabase/run.mjs.
 *
 * Build the web app with:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_stubstubstubstub1234 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:54399
 * then `node e2e/stub-supabase/stub.mjs &`, `next start -p 3100 -H 127.0.0.1`, and `npm run e2e:stub`.
 */
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";

import { assertLocalWeb } from "../../scripts/e2e-target-guard.mjs";
assertLocalWeb();   // the web URL must be named explicitly and be local: there is no default port
const WEB = process.env.WEB_URL;
const STUB = process.env.STUB_URL ?? "http://127.0.0.1:54399";
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  STUB: ${name}${extra ? `  [${String(extra).slice(0, 150)}]` : ""}`); };
const base = `${os.homedir()}/.cache/ms-playwright`;
const exe = process.env.CHROMIUM_PATH ?? `${base}/${fs.readdirSync(base).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctl = (p) => fetch(`${STUB}${p}`).then((r) => r.json());
const text = (page) => page.locator("body").innerText();
const T = {
  fr: { bad: "L'e-mail ou le mot de passe est incorrect.", rate: "Trop de tentatives.", net: "Impossible de joindre le service de connexion.", weak: "Ce mot de passe est trop faible.", sent: "Vérifiez votre e-mail", login: "Se connecter", signUp: "Créer le compte", forgot: "Envoyer le lien", noSession: "Ce lien est invalide ou a expiré" },
  ht: { bad: "Imèl la oswa modpas la pa kòrèk.", rate: "Twòp tantativ.", net: "Pa ka jwenn sèvis koneksyon an.", weak: "Modpas sa a twò fèb.", sent: "Verifye imèl ou", login: "Konekte", signUp: "Kreye kont lan", forgot: "Voye lyen an", noSession: "Lyen sa a pa valab oswa li ekspire" },
};
const fill = async (page, email, pw) => { await page.locator("input[type=email]").fill(email); if (pw) await page.locator("input[type=password]").first().fill(pw); };
const submit = (page) => page.locator("main form button[type=submit]").click();
// React attaches `__reactProps$…` to a DOM node when it hydrates it; text typed before that is thrown away by the controlled input, so wait for it.
async function hydrated(page) {
  if (!(await page.locator("main form input").count())) return;
  await page.waitForFunction(() => Object.keys(document.querySelector("main form input")).some((k) => k.startsWith("__reactProps")), null, { timeout: 8000 }).catch(() => {});
}
async function open(path) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${WEB}${path}`); await page.waitForLoadState("networkidle"); await hydrated(page);
  return { ctx, page };
}

for (const loc of ["fr", "ht"]) {
  await ctl("/__reset");
  const t = T[loc];
  // login errors
  let { ctx, page } = await open(`/${loc}/auth/login`);
  await fill(page, "alex.sample@example.com", "wrong-pass-1"); await submit(page);
  await page.getByText(t.bad).waitFor({ timeout: 10000 }); check(`[${loc}] wrong password -> translated invalid-credentials message (no Supabase English text)`, !/Invalid login/i.test(await text(page)));
  await page.locator("input[type=email]").fill("ratelimit@example.com"); await submit(page);
  await page.getByText(t.rate).waitFor({ timeout: 10000 }); check(`[${loc}] HTTP 429 -> translated rate-limit message`, true);
  await page.route("**/auth/v1/token*", (r) => r.abort());
  await page.locator("input[type=email]").fill("alex.sample@example.com"); await submit(page);
  await page.getByText(t.net).waitFor({ timeout: 10000 }); check(`[${loc}] network failure -> translated network message`, true);
  await ctx.close();

  // success, cookie session, next handling
  ({ ctx, page } = await open(`/${loc}/auth/login?next=%2Faccount%2Freservations`));
  await fill(page, "alex.sample@example.com", "correct horse"); await submit(page);
  await page.waitForURL(new RegExp(`/${loc}/account/reservations`), { timeout: 15000 }); check(`[${loc}] sign-in honors a safe ?next=`, true);
  const names = (await ctx.cookies()).map((c) => c.name);
  check(`[${loc}] session stored in the @supabase/ssr cookie`, names.some((n) => /^sb-.*-auth-token/.test(n)), names.join(","));
  const calls = (await ctl("/__log")).filter((l) => l.path === "/auth/v1/token");
  check(`[${loc}] the token request went to the configured (stub) Supabase URL`, calls.length > 0);
  await ctx.close();
  ({ ctx, page } = await open(`/${loc}/auth/login?next=%2F%2Fevil.example`));
  await fill(page, "alex.sample@example.com", "correct horse"); await submit(page);
  await page.waitForURL(new RegExp(`/${loc}/account`), { timeout: 15000 }); check(`[${loc}] an open-redirect ?next=//evil.example is ignored`, new URL(page.url()).host === new URL(WEB).host);
  await ctx.close();

  // sign-up: weak password, new and already-registered look the same
  ({ ctx, page } = await open(`/${loc}/auth/sign-up`));
  await fill(page, "weak@example.com", "password"); await page.locator("input[type=password]").nth(1).fill("password"); await submit(page);
  await page.getByText(t.weak).waitFor({ timeout: 10000 }); check(`[${loc}] provider weak_password -> translated message`, true);
  const shapes = [];
  for (const email of [`new-${loc}@example.com`, "alex.sample@example.com"]) {
    await page.goto(`${WEB}/${loc}/auth/sign-up`); await page.waitForLoadState("networkidle"); await hydrated(page);
    await fill(page, email, "longpassword1"); await page.locator("input[type=password]").nth(1).fill("longpassword1"); await submit(page);
    await page.waitForURL(/sign-up-success/, { timeout: 15000 });
    shapes.push((await text(page)).replace(/\s+/g, " "));
  }
  check(`[${loc}] new and already-registered addresses end on an IDENTICAL screen (stub answers 422 user_already_exists like the real GoTrue)`, shapes[0] === shapes[1] && shapes[0].includes(t.sent));
  await ctx.close();

  // recovery request + update-password without a session
  ({ ctx, page } = await open(`/${loc}/auth/forgot-password`));
  await fill(page, "nobody@example.com"); await submit(page);
  await page.waitForURL(/forgot-password/); await page.locator("[role=status]").first().waitFor({ timeout: 10000 });
  const rec = (await ctl("/__log")).find((l) => l.path === "/auth/v1/recover");
  check(`[${loc}] recovery request redirects back to /${loc}/auth/callback?next=/auth/update-password`, !!rec && decodeURIComponent(JSON.stringify(rec)).includes(`/${loc}/auth/callback?next=/auth/update-password`), JSON.stringify(rec?.query));
  await ctx.close();
  ({ ctx, page } = await open(`/${loc}/auth/update-password`));
  await page.locator("input[type=password]").fill("a-new-long-password"); await submit(page);
  await page.getByText(t.noSession).waitFor({ timeout: 10000 }); check(`[${loc}] update-password without a recovery session -> expired-link state, no success`, true);
  await ctx.close();

  // callback with a bad code
  ({ ctx, page } = await open(`/${loc}/auth/callback?code=bad&next=%2Fauth%2Fupdate-password`));
  check(`[${loc}] callback with an invalid code lands on /auth/error?reason=reset`, new RegExp(`/${loc}/auth/error\\?reason=reset`).test(page.url()), page.url());
  await ctx.close();
}
console.log(`\n${results.filter(Boolean).length} passed, ${results.filter((x) => !x).length} failed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
