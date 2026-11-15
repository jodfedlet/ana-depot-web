/**
 * SAMPLE ARTWORK GENERATOR
 * Draws simple, license-free illustrations of generic goods so the storefront has
 * product imagery before the business supplies real photography.
 *
 *   node scripts/generate-sample-images.mjs
 *
 * Output: public/sample/{products,categories}/*.svg, public/sample/hero.svg, promo.svg
 * Replace these with real images (served from Supabase Storage later) — nothing in the
 * UI depends on the artwork beyond the `src` strings in src/lib/mock/catalog.ts.
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../public/sample");

// ---------- color helpers ----------
const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (r) => "#" + r.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => {
  const A = toRgb(a), B = toRgb(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
};
const lighten = (h, t) => mix(h, "#ffffff", t);
const darken = (h, t) => mix(h, "#000000", t);
const pal = (m) => ({ m, d: darken(m, 0.22), dd: darken(m, 0.45), l: lighten(m, 0.35), ll: lighten(m, 0.7) });

// ---------- objects: local space 400x400, ground at y=400, centered x=200 ----------
const objects = {
  mug: (p) => `
    <path d="M110 170H280V360Q280 400 240 400H150Q110 400 110 360Z" fill="${p.m}"/>
    <path d="M280 215H302a52 52 0 0 1 0 104H280" fill="none" stroke="${p.d}" stroke-width="22" stroke-linecap="round"/>
    <rect x="110" y="300" width="170" height="7" fill="${p.d}" opacity=".55"/>
    <ellipse cx="195" cy="170" rx="85" ry="17" fill="${p.d}"/>
    <ellipse cx="195" cy="172" rx="72" ry="11" fill="${p.dd}"/>
    <rect x="128" y="196" width="14" height="170" rx="7" fill="#fff" opacity=".2"/>`,
  bottle: (p) => `
    <rect x="163" y="28" width="74" height="44" rx="9" fill="${p.dd}"/>
    <rect x="171" y="70" width="58" height="54" fill="${p.ll}" opacity=".7"/>
    <rect x="130" y="108" width="140" height="292" rx="44" fill="${p.ll}" opacity=".75" stroke="${p.l}" stroke-width="4"/>
    <path d="M134 230H266V356Q266 396 226 396H174Q134 396 134 356Z" fill="${p.m}" opacity=".55"/>
    <rect x="146" y="128" width="12" height="190" rx="6" fill="#fff" opacity=".6"/>
    <rect x="168" y="280" width="64" height="40" rx="5" fill="#fff" opacity=".85"/>
    <rect x="178" y="292" width="44" height="5" rx="2" fill="${p.d}"/><rect x="178" y="304" width="30" height="5" rx="2" fill="${p.l}"/>`,
  tote: (p) => `
    <path d="M140 170V110a60 60 0 0 1 120 0V170" fill="none" stroke="${p.d}" stroke-width="16" stroke-linecap="round"/>
    <path d="M92 160H308L322 400H78Z" fill="${p.m}"/>
    <path d="M92 160H308L310 190H90Z" fill="${p.d}" opacity=".35"/>
    <rect x="150" y="250" width="100" height="84" rx="6" fill="${p.ll}" opacity=".9"/>
    <rect x="166" y="274" width="68" height="7" rx="3" fill="${p.d}"/><rect x="166" y="292" width="46" height="7" rx="3" fill="${p.l}"/>`,
  pouch: (p) => `
    <path d="M70 250Q70 220 100 220H300Q330 220 330 250V372Q330 400 300 400H100Q70 400 70 372Z" fill="${p.m}"/>
    <rect x="70" y="236" width="260" height="10" fill="${p.dd}" opacity=".45"/>
    <rect x="86" y="256" width="228" height="4" rx="2" fill="${p.ll}" opacity=".7" />
    <path d="M300 232q36 -4 40 16" fill="none" stroke="${p.d}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="300" cy="232" r="9" fill="${p.l}"/>
    <rect x="150" y="310" width="100" height="34" rx="4" fill="${p.ll}" opacity=".85"/>`,
  lamp: (p) => `
    <rect x="100" y="378" width="140" height="22" rx="11" fill="${p.d}"/>
    <rect x="112" y="370" width="116" height="14" rx="7" fill="${p.m}"/>
    <path d="M170 372L128 205" stroke="${p.m}" stroke-width="13" stroke-linecap="round"/>
    <path d="M128 205L252 104" stroke="${p.m}" stroke-width="13" stroke-linecap="round"/>
    <circle cx="128" cy="205" r="13" fill="${p.dd}"/>
    <circle cx="252" cy="104" r="12" fill="${p.dd}"/>
    <circle cx="214" cy="190" r="70" fill="#ffe9a8" opacity=".18"/>
    <g transform="translate(252 104) rotate(42)">
      <path d="M-34 0H34L58 66H-58Z" fill="${p.m}"/><path d="M-58 66H58V74H-58Z" fill="${p.dd}"/>
      <ellipse cx="0" cy="76" rx="22" ry="9" fill="#fff4cf"/>
    </g>`,
  notebook: (p) => `
    <g transform="rotate(7 300 400)"><rect x="170" y="86" width="140" height="314" rx="9" fill="${p.l}"/><rect x="170" y="86" width="17" height="314" rx="6" fill="${p.d}" opacity=".5"/></g>
    <rect x="90" y="96" width="150" height="304" rx="10" fill="${p.m}"/>
    <rect x="90" y="96" width="19" height="304" rx="8" fill="${p.dd}" opacity=".45"/>
    <rect x="212" y="96" width="9" height="304" fill="${p.dd}" opacity=".7"/>
    <rect x="128" y="150" width="68" height="52" rx="4" fill="${p.ll}"/>
    <rect x="138" y="164" width="48" height="6" rx="3" fill="${p.d}"/><rect x="138" y="180" width="32" height="6" rx="3" fill="${p.l}"/>`,
  blanket: (p) => `
    <rect x="76" y="320" width="248" height="80" rx="8" fill="${p.m}"/>
    <rect x="86" y="244" width="228" height="80" rx="8" fill="${p.l}"/>
    <rect x="98" y="168" width="204" height="80" rx="8" fill="${p.m}"/>
    <g fill="${p.dd}" opacity=".45">
      <rect x="76" y="346" width="248" height="9"/><rect x="76" y="368" width="248" height="4"/>
      <rect x="86" y="270" width="228" height="9"/><rect x="86" y="292" width="228" height="4"/>
      <rect x="98" y="194" width="204" height="9"/><rect x="98" y="216" width="204" height="4"/></g>
    <g stroke="${p.d}" stroke-width="3" stroke-linecap="round">${Array.from({ length: 14 }, (_, i) => `<path d="M324 ${326 + i * 5.2}h14"/>`).join("")}</g>`,
  backpack: (p) => `
    <path d="M150 100V82a50 50 0 0 1 100 0V100" fill="none" stroke="${p.dd}" stroke-width="14" stroke-linecap="round"/>
    <path d="M110 190Q110 90 200 90Q290 90 290 190V372Q290 400 262 400H138Q110 400 110 372Z" fill="${p.m}"/>
    <path d="M110 190Q110 90 200 90Q290 90 290 190V215H110Z" fill="${p.d}" opacity=".4"/>
    <rect x="132" y="262" width="136" height="112" rx="22" fill="${p.d}"/>
    <rect x="148" y="284" width="104" height="6" rx="3" fill="${p.ll}" opacity=".8"/>
    <rect x="164" y="318" width="72" height="30" rx="6" fill="${p.dd}"/>
    <path d="M132 150Q200 130 268 150" fill="none" stroke="${p.ll}" stroke-width="5" stroke-linecap="round" opacity=".7"/>
    <path d="M104 230Q86 290 104 350" fill="none" stroke="${p.dd}" stroke-width="14" stroke-linecap="round"/>`,
  clock: (p) => `
    <path d="M150 340L130 400M250 340L270 400" stroke="${p.dd}" stroke-width="12" stroke-linecap="round"/>
    <circle cx="200" cy="215" r="150" fill="${p.m}"/><circle cx="200" cy="215" r="128" fill="${p.ll}"/>
    ${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; const r1 = i % 3 === 0 ? 100 : 110; return `<path d="M${200 + Math.sin(a) * r1} ${215 - Math.cos(a) * r1}L${200 + Math.sin(a) * 120} ${215 - Math.cos(a) * 120}" stroke="${p.dd}" stroke-width="${i % 3 === 0 ? 6 : 3}" stroke-linecap="round"/>`; }).join("")}
    <path d="M200 215L200 132" stroke="${p.dd}" stroke-width="8" stroke-linecap="round"/>
    <path d="M200 215L254 246" stroke="${p.dd}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="200" cy="215" r="9" fill="${p.d}"/>`,
  planter: (p) => `
    <g fill="#3f7d5a">
      <path transform="translate(200 224) rotate(-38)" d="M0 0C-38-50-22-120 0-150C22-120 38-50 0 0Z"/>
      <path transform="translate(200 224) rotate(38)" d="M0 0C-38-50-22-120 0-150C22-120 38-50 0 0Z" fill="#33694b"/>
      <path transform="translate(200 224) rotate(-8)" d="M0 0C-42-60-24-150 0-190C24-150 42-60 0 0Z" fill="#4b9368"/>
      <path transform="translate(200 224) rotate(16)" d="M0 0C-32-44-18-100 0-128C18-100 32-44 0 0Z" fill="#2f6247"/>
      <path transform="translate(200 224) rotate(-62)" d="M0 0C-30-34-16-84 0-108C16-84 30-34 0 0Z" fill="#33694b"/></g>
    <path d="M112 244H288L262 400H138Z" fill="${p.m}"/>
    <rect x="100" y="218" width="200" height="38" rx="10" fill="${p.d}"/>
    <rect x="128" y="274" width="12" height="100" rx="6" fill="#fff" opacity=".18" transform="rotate(7 134 324)"/>`,
  board: (p) => `
    <g transform="rotate(-7 200 400)">
      <rect x="104" y="46" width="192" height="354" rx="32" fill="${p.m}"/>
      <circle cx="200" cy="96" r="20" fill="${p.ll}" opacity=".85"/>
      <g stroke="${p.d}" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round">
        <path d="M140 150C160 200 130 260 150 330"/><path d="M190 140C210 210 180 280 200 380"/>
        <path d="M240 150C230 220 262 290 244 370"/><path d="M270 170C262 240 280 300 272 350"/></g>
      <rect x="104" y="380" width="192" height="20" rx="10" fill="${p.d}" opacity=".4"/>
    </g>`,
  organizer: (p) => `
    <rect x="88" y="190" width="70" height="120" rx="8" fill="${p.l}"/>
    <rect x="180" y="150" width="62" height="160" rx="8" fill="${p.d}"/>
    <path d="M110 190L98 120M126 190L130 100M140 190L156 124" stroke="${p.dd}" stroke-width="7" stroke-linecap="round"/>
    <path d="M200 150L192 76M216 150L222 90" stroke="${p.m}" stroke-width="7" stroke-linecap="round"/>
    <rect x="66" y="290" width="270" height="110" rx="14" fill="${p.m}"/>
    <rect x="76" y="304" width="108" height="86" rx="8" fill="${p.d}" opacity=".5"/>
    <rect x="196" y="304" width="62" height="86" rx="8" fill="${p.d}" opacity=".5"/>
    <rect x="270" y="304" width="56" height="86" rx="8" fill="${p.d}" opacity=".5"/>`,
  lantern: (p) => `
    <path d="M150 90a50 50 0 0 1 100 0" fill="none" stroke="${p.dd}" stroke-width="10" stroke-linecap="round"/>
    <path d="M128 140H272L252 108H148Z" fill="${p.m}"/>
    <rect x="136" y="140" width="128" height="218" rx="10" fill="#ffe9a8"/>
    <ellipse cx="200" cy="260" rx="46" ry="70" fill="#fff6d6"/>
    <g stroke="${p.dd}" stroke-width="7"><path d="M136 140V358M200 140V358M264 140V358"/></g>
    <rect x="124" y="352" width="152" height="46" rx="12" fill="${p.m}"/>
    <rect x="124" y="352" width="152" height="10" fill="${p.d}"/>`,

  poles: (p) => `
    ${[[118, 50], [152, 30], [186, 64], [220, 40], [254, 58], [288, 36]].map(([x, top], i) => `
      <rect x="${x - 15}" y="${top}" width="30" height="${400 - top}" rx="4" fill="${i % 2 ? p.m : p.l}"/>
      <rect x="${x - 9}" y="${top + 6}" width="6" height="${390 - top - 6}" rx="3" fill="#fff" opacity=".35"/>
      <ellipse cx="${x}" cy="${top}" rx="15" ry="6" fill="${p.d}"/><ellipse cx="${x}" cy="${top}" rx="9" ry="3.5" fill="${p.dd}"/>`).join("")}
    <rect x="96" y="250" width="214" height="12" rx="3" fill="${p.dd}" opacity=".75"/><rect x="96" y="150" width="214" height="12" rx="3" fill="${p.dd}" opacity=".75"/>`,
  shoe: (p) => `
    <path d="M62 352C62 300 98 282 130 270L184 214C214 200 246 226 276 252C318 268 338 300 338 352Z" fill="${p.m}"/>
    <path d="M184 214C214 200 246 226 276 252L200 262Z" fill="${p.l}" opacity=".6"/>
    <path d="M150 262l22 14M170 242l22 14M190 224l22 14" stroke="${p.ll}" stroke-width="7" stroke-linecap="round"/>
    <path d="M62 352H338V384Q338 396 322 396H78Q62 396 62 384Z" fill="${p.ll}"/>
    <path d="M62 366H338" stroke="${p.d}" stroke-width="5" opacity=".45"/>
    <path d="M100 330Q200 300 316 330" stroke="${p.dd}" stroke-width="9" fill="none" stroke-linecap="round" opacity=".55"/>`,
  mattress: (p) => `
    <path d="M330 300L378 244V344L330 400Z" fill="${p.dd}" opacity=".55"/>
    <rect x="40" y="300" width="290" height="100" rx="14" fill="${p.m}"/>
    <path d="M58 300L116 244H378L330 300Z" fill="${p.l}"/>
    <path d="M40 342H330M40 366H330" stroke="${p.d}" stroke-width="3" stroke-dasharray="10 8" opacity=".5"/>
    <path d="M110 268H340M150 258H356" stroke="${p.d}" stroke-width="3" stroke-dasharray="10 8" opacity=".35"/>
    <rect x="40" y="300" width="290" height="10" rx="5" fill="${p.d}" opacity=".5"/>`,
  table: (p) => `
    <rect x="116" y="222" width="12" height="150" fill="${p.dd}" opacity=".7"/><rect x="274" y="222" width="12" height="150" fill="${p.dd}" opacity=".7"/>
    <path d="M56 176L316 176L372 216L16 216Z" fill="${p.l}"/>
    <rect x="16" y="216" width="356" height="18" rx="3" fill="${p.m}"/>
    <rect x="40" y="234" width="18" height="166" fill="${p.d}"/><rect x="330" y="234" width="18" height="166" fill="${p.d}"/>
    <path d="M70 196H300M92 204H330" stroke="${p.d}" stroke-width="2" opacity=".35"/>`,
  chair: (p) => `
    <rect x="124" y="58" width="152" height="150" rx="14" fill="${p.m}"/>
    <path d="M150 78V190M200 78V190M250 78V190" stroke="${p.d}" stroke-width="10" stroke-linecap="round" opacity=".55"/>
    <rect x="106" y="214" width="188" height="30" rx="10" fill="${p.l}"/>
    <rect x="116" y="244" width="16" height="156" rx="4" fill="${p.d}"/><rect x="268" y="244" width="16" height="156" rx="4" fill="${p.d}"/>
    <rect x="130" y="270" width="140" height="10" rx="3" fill="${p.dd}" opacity=".6"/>`,
  bucket: (p) => `
    <path d="M110 150Q200 30 290 150" stroke="${p.dd}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M100 152H300L270 388Q268 400 254 400H146Q132 400 130 388Z" fill="${p.m}"/>
    <path d="M118 270H282M122 330H278" stroke="${p.d}" stroke-width="6" opacity=".4"/>
    <rect x="90" y="140" width="220" height="20" rx="10" fill="${p.d}"/>
    <rect x="160" y="196" width="80" height="48" rx="6" fill="${p.ll}" opacity=".9"/><rect x="172" y="210" width="56" height="7" rx="3" fill="${p.d}"/>`,
  pot: (p) => `
    <rect x="62" y="250" width="50" height="16" rx="8" fill="${p.dd}"/><rect x="288" y="250" width="50" height="16" rx="8" fill="${p.dd}"/>
    <rect x="108" y="226" width="184" height="158" rx="16" fill="${p.m}"/>
    <path d="M100 226Q200 112 300 226Z" fill="${p.l}"/>
    <circle cx="200" cy="150" r="13" fill="${p.dd}"/>
    <rect x="124" y="250" width="14" height="110" rx="7" fill="#fff" opacity=".35"/>
    <rect x="108" y="226" width="184" height="10" fill="${p.d}" opacity=".5"/>
    <ellipse cx="200" cy="396" rx="92" ry="6" fill="${p.d}"/>`,
  spool: (p) => `
    <circle cx="200" cy="262" r="138" fill="${p.m}"/>
    ${[118, 96, 74, 52].map((r) => `<circle cx="200" cy="262" r="${r}" fill="none" stroke="${p.d}" stroke-width="7" opacity=".55"/>`).join("")}
    <circle cx="200" cy="262" r="30" fill="${p.dd}"/><circle cx="200" cy="262" r="16" fill="#fff" opacity=".5"/>
    <path d="M330 300Q372 340 350 388" stroke="${p.m}" stroke-width="12" fill="none" stroke-linecap="round"/>`,
  box: (p) => `
    <path d="M320 196L384 142V348L320 400Z" fill="${p.dd}" opacity=".6"/>
    <rect x="72" y="196" width="248" height="204" rx="4" fill="${p.m}"/>
    <path d="M72 196L136 142H384L320 196Z" fill="${p.l}"/>
    <rect x="174" y="196" width="46" height="204" fill="${p.ll}" opacity=".75"/><path d="M174 196L238 142H284L220 196Z" fill="${p.ll}" opacity=".6"/>
    <rect x="100" y="286" width="62" height="46" rx="3" fill="#fff" opacity=".9"/><rect x="108" y="298" width="40" height="6" rx="3" fill="${p.d}"/><rect x="108" y="312" width="26" height="6" rx="3" fill="${p.l}"/>`,
  vase: (p) => `
    <g stroke="#a98a5c" stroke-width="5" stroke-linecap="round" fill="none">
      <path d="M200 70L160 -30"/><path d="M200 70L214 -50"/><path d="M200 70L252 -10"/></g>
    <g fill="#c9a96b"><ellipse cx="158" cy="-34" rx="9" ry="22" transform="rotate(-14 158 -34)"/><ellipse cx="214" cy="-54" rx="9" ry="24"/><ellipse cx="254" cy="-14" rx="9" ry="22" transform="rotate(26 254 -14)"/></g>
    <path d="M168 66H232C232 130 304 160 304 272C304 348 262 400 200 400C138 400 96 348 96 272C96 160 168 130 168 66Z" fill="${p.m}"/>
    <ellipse cx="200" cy="66" rx="32" ry="8" fill="${p.dd}"/>
    <path d="M130 230C140 200 160 180 178 168" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".25"/>`,
};

// ---------- layouts ----------
const doc = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-hidden="true">
<defs><filter id="blur" x="-30%" y="-300%" width="160%" height="700%"><feGaussianBlur stdDeviation="9"/></filter>${defs}</defs>
${body}
</svg>`;

const place = (kind, p, cx, ground, s) =>
  `<g transform="translate(${cx - 200 * s} ${ground - 400 * s}) scale(${s})">${objects[kind](p)}</g>`;
const shadow = (cx, y, rx) =>
  `<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="${rx * 0.09}" fill="#000" opacity=".22" filter="url(#blur)"/>`;

function layoutMain({ kind, color, bg }) {
  const p = pal(color), s = kind === "vase" ? 1.2 : kind === "clock" ? 1.35 : 1.45;
  return doc(800, 800,
    `<radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${lighten(bg, 0.45)}"/><stop offset="1" stop-color="${bg}"/></radialGradient>`,
    `<rect width="800" height="800" fill="url(#g)"/><rect y="640" width="800" height="160" fill="${darken(bg, 0.06)}"/>
     ${shadow(400, 652, 190 * s)}${place(kind, p, 400, 645, s)}`);
}
function layoutContext({ kind, color, bg2 }) {
  const p = pal(color), s = kind === "vase" ? 0.95 : 1.15;
  return doc(800, 800, "",
    `<rect width="800" height="800" fill="${bg2}"/>
     <path d="M110 640V300a190 190 0 0 1 380 0V640Z" fill="${lighten(bg2, 0.45)}"/>
     <circle cx="620" cy="210" r="78" fill="${darken(bg2, 0.12)}"/>
     <rect y="640" width="800" height="160" fill="${darken(bg2, 0.08)}"/>
     <rect x="520" y="560" width="190" height="80" rx="8" fill="${darken(bg2, 0.18)}"/>
     ${shadow(300, 652, 170 * s)}${place(kind, p, 300, 645, s)}`);
}
function layoutDetail({ kind, color, bg3 }) {
  const p = pal(color), s = 2.15;
  return doc(800, 800,
    `<radialGradient id="g" cx="50%" cy="45%" r="80%"><stop offset="0" stop-color="${lighten(bg3, 0.35)}"/><stop offset="1" stop-color="${darken(bg3, 0.08)}"/></radialGradient>`,
    `<rect width="800" height="800" fill="url(#g)"/>${place(kind, p, 400, 850, s)}`);
}

// ---------- catalog definition (mirror slugs used in src/lib/mock/catalog-seed.ts) ----------
const products = [
  ["tube-rond-galva", "poles", "#8c9399", "#e6e3dc", "#dde4e6", "#d3d8d9"],
  ["fer-a-beton", "poles", "#7a5a3c", "#ebe3d6", "#e1e6e2", "#e3d6c4"],
  ["corniere-acier", "poles", "#9aa3ab", "#e8e5de", "#dee5ea", "#d5dadd"],
  ["baskets-sport", "shoe", "#1c1b19", "#ece7de", "#dfe6ea", "#d9d4c8"],
  ["sandales-cuir", "shoe", "#b88a5a", "#efe5d6", "#dfe7e2", "#ead8bf"],
  ["matelas-mousse", "mattress", "#c9d6e2", "#e9e3d8", "#dce5e3", "#d6dde5"],
  ["drap-coton-set", "blanket", "#8aa1b8", "#ece6da", "#dfe6ea", "#d5dde5"],
  ["table-a-manger", "table", "#a8723f", "#efe6d8", "#e0e7e3", "#ead7bd"],
  ["chaise-empilable", "chair", "#14574f", "#e6e9e3", "#efe3d2", "#d3e0db"],
  ["table-basse", "table", "#c8a97e", "#ece4d6", "#dde6e5", "#e7d8c6"],
  ["seau-pack", "bucket", "#3f7da8", "#e4e9ea", "#efe2d0", "#d3dfe6"],
  ["corde-nylon", "spool", "#d8c7a5", "#e8e1d4", "#dbe3ea", "#efe6d6"],
  ["boite-vis", "box", "#b08a5a", "#ece4d6", "#dfe6ea", "#e9d6bc"],
  ["casserole-set", "pot", "#b7bcc2", "#eae6de", "#dde5e2", "#d6dadd"],
  ["etagere-bois", "board", "#6e8f86", "#e9e4d8", "#efe0cc", "#d4e0db"],
  ["tabouret-bois", "chair", "#b5441b", "#efe4d6", "#e2e9e4", "#f2d9c9"],
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "products"), { recursive: true });
fs.mkdirSync(path.join(OUT, "categories"), { recursive: true });
const write = (rel, svg) => fs.writeFileSync(path.join(OUT, rel), svg);

for (const [slug, kind, color, bg, bg2, bg3] of products) {
  write(`products/${slug}-1.svg`, layoutMain({ kind, color, bg }));
  write(`products/${slug}-2.svg`, layoutContext({ kind, color, bg2 }));
  write(`products/${slug}-3.svg`, layoutDetail({ kind, color, bg3 }));
}

// Extra colorways used by products with color variants
const colorways = [
  ["baskets-sport", "shoe", "#f2eee6", "#dcd7cc", "-blanc"],
];
for (const [slug, kind, color, bg, suffix] of colorways) write(`products/${slug}${suffix}.svg`, layoutMain({ kind, color, bg }));

// Categories 4:3
const categories = [
  ["metal", "poles", "#8c9399", "#e6e3dc"],
  ["shoes", "shoe", "#1c1b19", "#ece7de"],
  ["bedding", "mattress", "#c9d6e2", "#e9e3d8"],
  ["furniture", "chair", "#14574f", "#e6e9e3"],
  ["household", "bucket", "#3f7da8", "#e4e9ea"],
  ["general", "box", "#b08a5a", "#ece4d6"],
];
for (const [slug, kind, color, bg] of categories) {
  const p = pal(color);
  write(`categories/${slug}.svg`, doc(800, 600,
    `<radialGradient id="g" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="${lighten(bg, 0.4)}"/><stop offset="1" stop-color="${bg}"/></radialGradient>`,
    `<rect width="800" height="600" fill="url(#g)"/><rect y="500" width="800" height="100" fill="${darken(bg, 0.06)}"/>${shadow(400, 506, 150)}${place(kind, p, 400, 500, 1.05)}`));
}

// Neutral placeholder shown when a product or category has no image
write("placeholder.svg", doc(800, 800, "", `<rect width="800" height="800" fill="#eee7db"/><g fill="none" stroke="#c9c0af" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"><rect x="250" y="270" width="300" height="260" rx="24"/><circle cx="330" cy="350" r="26"/><path d="M262 500l100-100 70 70 40-40 66 66"/></g>`));

// Hero 6:5 — one still life of general merchandise: furniture, hardware, bedding, footwear and household goods share
// the display, no category dominates, and nothing in it names a specialty. A teal arch + warm floor keep the brand look.
write("hero.svg", doc(1200, 1000,
  `<linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b6a60"/><stop offset="1" stop-color="#0f4640"/></linearGradient>
   <linearGradient id="plank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9ccb6"/><stop offset="1" stop-color="#c9bba2"/></linearGradient>`,
  `<rect width="1200" height="1000" fill="#eee7db"/>
   <g transform="translate(0 70)">
   <path d="M120 700V520a480 480 0 0 1 960 0V700Z" fill="url(#a)"/>
   <circle cx="1040" cy="210" r="64" fill="#b5441b"/>
   <!-- back row, on the floor -->
   <rect y="690" width="1200" height="310" fill="#e1d7c6"/><rect y="690" width="1200" height="6" fill="#c9c0af"/>
   ${shadow(250, 700, 170)}${place("chair", pal("#a8723f"), 250, 698, 1.0)}
   ${shadow(600, 702, 150)}${place("poles", pal("#8c9399"), 600, 698, 0.95)}
   ${shadow(950, 700, 190)}${place("blanket", pal("#8aa1b8"), 950, 698, 1.15)}
   <!-- front row, a low display step -->
   <rect x="60" y="845" width="1080" height="26" rx="6" fill="url(#plank)"/><rect x="60" y="868" width="1080" height="6" fill="#b9ab92"/>
   ${shadow(170, 848, 105)}${place("shoe", pal("#1c1b19"), 170, 846, 0.62)}
   ${shadow(390, 848, 105)}${place("pot", pal("#b7bcc2"), 390, 846, 0.58)}
   ${shadow(600, 848, 80)}${place("spool", pal("#d8c7a5"), 600, 846, 0.5)}
   ${shadow(790, 848, 90)}${place("bucket", pal("#3f7da8"), 790, 846, 0.5)}
   ${shadow(990, 848, 100)}${place("box", pal("#b08a5a"), 990, 846, 0.56)}
   </g>`));

// Promo 4:3 — "one, then several, then many": the same neutral carton in growing quantities (no product category implied)
const carton = (cx, ground, s, c) => `${shadow(cx, ground + 4, 105 * s)}${place("box", pal(c), cx, ground, s)}`;
write("promo.svg", doc(1200, 900,
  "",
  `<rect width="1200" height="900" fill="#f1d5c3"/>
   <circle cx="920" cy="250" r="180" fill="#e9bba0"/><circle cx="230" cy="690" r="120" fill="#e9bba0" opacity=".6"/>
   <rect y="720" width="1200" height="180" fill="#e0b79c"/>
   ${carton(170, 726, 0.85, "#b08a5a")}
   ${carton(400, 726, 0.62, "#b08a5a")}${carton(560, 726, 0.62, "#a77f50")}${carton(480, 600, 0.62, "#b89463")}
   ${carton(820, 726, 0.45, "#b08a5a")}${carton(920, 726, 0.45, "#a77f50")}${carton(1020, 726, 0.45, "#b89463")}${carton(870, 635, 0.45, "#a77f50")}${carton(970, 635, 0.45, "#b08a5a")}${carton(920, 544, 0.45, "#b89463")}`));

console.log("Sample artwork written to", OUT);
