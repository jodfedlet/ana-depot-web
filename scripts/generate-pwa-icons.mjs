/**
 * Renders the PWA icons from the EXISTING wordmark monogram (`components/layout/wordmark.tsx`: "AD", Fraunces semibold, white on brand-700).
 * No new logo is invented: when the final identity exists, replace the wordmark and re-run this script.
 *
 *   node scripts/generate-pwa-icons.mjs <path-to-Fraunces-latin.woff2>
 *
 * The font file is the one `next/font` emitted for Fraunces (`.next/static/media/*.woff2`, the file whose @font-face has the basic-latin unicode-range).
 * Output: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png and src/app/apple-icon.png (180px, full bleed; iOS rounds the corners itself).
 * Colours are the design tokens `--color-brand-700` / white (CSS variables are not available to a rasteriser).
 */
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright-core";

const fontPath = process.argv[2];
if (!fontPath || !fs.existsSync(fontPath)) { console.error("Usage: node scripts/generate-pwa-icons.mjs <Fraunces-latin.woff2>"); process.exit(2); }
const BRAND_700 = "#0f4640";
const font = fs.readFileSync(fontPath).toString("base64");

/** `radius` = corner radius as a share of the size (0 = full bleed); `glyph` = text height share of the canvas. */
const html = (size, radius, glyph) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:F;font-weight:100 900;src:url(data:font/woff2;base64,${font}) format("woff2")}
html,body{margin:0;background:transparent}
#i{width:${size}px;height:${size}px;background:${BRAND_700};border-radius:${size * radius}px;display:grid;place-items:center;color:#fff;
font:600 ${size * glyph}px/1 F,serif;letter-spacing:-0.02em;font-variation-settings:"opsz" 72}
</style><div id="i">AD</div>`;

const base = `${os.homedir()}/.cache/ms-playwright`;
const dir = fs.readdirSync(base).find((d) => d.startsWith("chromium-"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? `${base}/${dir}/chrome-linux64/chrome`, args: ["--no-sandbox"] });
const jobs = [
  ["public/icons/icon-192.png", 192, 0.22, 0.42],
  ["public/icons/icon-512.png", 512, 0.22, 0.42],
  // maskable: the whole canvas is the brand colour and the glyph sits inside the central 80% "safe zone"
  ["public/icons/icon-maskable-512.png", 512, 0, 0.34],
  ["src/app/apple-icon.png", 180, 0, 0.4],
];
for (const [out, size, radius, glyph] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(html(size, radius, glyph));
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#i").screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log("wrote", out);
}
await browser.close();
