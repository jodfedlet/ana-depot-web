import type { MetadataRoute } from "next";

/**
 * Web app manifest (served at /manifest.webmanifest). A manifest cannot be translated per visitor, so the install name is the brand name only and
 * `lang` is the default language; the app itself opens in the visitor's saved language (`/` is redirected by the proxy from the language cookie).
 * Colours: `theme_color` = token `--color-brand-700`, `background_color` = `--color-canvas` (a manifest cannot use CSS variables).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ana Dépôt",
    short_name: "Ana Dépôt",
    description: "Ana Dépôt — réservez en ligne, payez et retirez en magasin / Rezève sou entènèt, peye epi pran machandiz la nan magazen an.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9f6",
    theme_color: "#0f4640",
    categories: ["shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
