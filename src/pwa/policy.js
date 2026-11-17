/*
 * Cache policy of the service worker: PURE functions only (no `self`, no `caches`, no `fetch`), so they are unit-tested in Node (`policy.test.ts`)
 * and concatenated in front of `sw.js` by `app/sw.js/route.ts`. Plain classic-script JavaScript on purpose: a service worker is not bundled.
 *
 * The single most important property: a response is only ever cached when this file says so, and it says so ONLY for
 *   - hashed build assets,
 *   - public storefront pages (an ALLOW-list of paths, everything else is treated as private),
 *   - the PUBLIC catalog read endpoints of the API (an ALLOW-list, GET, no Authorization header),
 *   - images.
 * Staff pages (/admin), account, auth, reservation creation/tracking, every request carrying credentials, Supabase traffic and every non-GET
 * request are never cached and never served from a cache.
 */
(function (root) {
  "use strict";

  var LOCALES = ["fr", "ht"];
  var DEFAULT_LOCALE = "fr";

  /** Path segments (after the locale) that are private or transactional: never cached, never served offline. */
  var PRIVATE_SEGMENTS = ["admin", "account", "auth", "reserve", "reservations"];

  /** Public pages that may be kept for offline reading (after the locale): home, catalog, product, cart, search, info pages. The bare `/` (the manifest's start_url, redirected to a language by the proxy) is allowed so an installed app can open offline; the redirect itself is never stored, `fallbackKeys` answers from the saved language home. */
  var PUBLIC_PAGE = /^(\/|\/(fr|ht)(\/(products(\/[^/]+)?|cart|search|info\/[^/]+))?\/?)$/;

  /** The public, anonymous catalog endpoints of the API. `/api/v1/admin/**`, `/me/**` and `/reservations/**` can never match. */
  var PUBLIC_API = /^\/api\/v1\/(products|products\/search|products\/[^/]+|categories|categories\/[^/]+|store\/pickup)\/?$/;

  /** The offline notice and its two helper files: precached at install, always answered from the cache. */
  var SHELL_FILES = ["/offline.html", "/offline.css", "/offline.js"];

  /** Kinds of cache. Every cache is named `ana-<version>-<kind>`; `PRIVATE_KINDS` are emptied when a session ends. */
  var KINDS = ["shell", "static", "pages", "api", "images"];
  var PRIVATE_KINDS = ["pages", "api"];
  var PREFIX = "ana-";
  var MAX_ENTRIES = { shell: 20, static: 250, pages: 40, api: 60, images: 40 };
  /** Public catalog data older than this is never served offline (stock and prices must not look current for days). */
  var API_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  var NETWORK_TIMEOUT_MS = 4000;

  function cacheName(version, kind) { return PREFIX + version + "-" + kind; }
  /** True for a cache of this app that belongs to another (older) version: deleted on activation. */
  function isObsoleteCache(name, version) { return name.indexOf(PREFIX) === 0 && name.indexOf(PREFIX + version + "-") !== 0; }

  function localeOf(pathname) {
    var m = /^\/(fr|ht)(\/|$)/.exec(pathname);
    return m ? m[1] : null;
  }
  /** Path without the locale prefix ("/fr/admin/x" -> "/admin/x"; "/fr" -> "/"). */
  function pathWithoutLocale(pathname) {
    var loc = localeOf(pathname);
    if (!loc) return pathname;
    var rest = pathname.slice(loc.length + 1);
    return rest === "" ? "/" : rest;
  }
  function isPrivatePath(pathname) {
    var rest = pathWithoutLocale(pathname);
    var first = rest.split("/")[1] || "";
    return PRIVATE_SEGMENTS.indexOf(first) !== -1;
  }
  function isPublicPage(pathname) { return PUBLIC_PAGE.test(pathname); }

  /**
   * Decides what the worker does with a request.
   *   input: { url, method, mode, destination, hasAuthorization, hasRange, origin (of the app), apiOrigin (or null), assetOrigins (array, may be empty) }
   *   output: "bypass"   -> not intercepted at all (the browser handles it; nothing cached)
   *           "static"   -> hashed build asset: cache-first
   *           "page"     -> public storefront page: network-first with timeout, cached copy offline
   *           "shell"    -> the offline notice files: cache-first
   *           "private-page" -> navigation that must always hit the network; offline it gets the offline notice, never a cached copy
   *           "api"      -> public catalog JSON: network-first with timeout, cached copy (max 24h) only when the network fails
   *           "image"    -> image: stale-while-revalidate
   */
  function classify(r) {
    if (r.method !== "GET") return "bypass";
    if (r.hasAuthorization || r.hasRange) return "bypass";
    var u;
    try { u = new URL(r.url); } catch { return "bypass"; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return "bypass";

    if (u.origin !== r.origin) {
      if (r.apiOrigin && u.origin === r.apiOrigin) return PUBLIC_API.test(u.pathname) ? "api" : "bypass";
      if (r.destination === "image") {
        var allowed = r.assetOrigins && r.assetOrigins.length ? r.assetOrigins.indexOf(u.origin) !== -1 : true;
        return allowed ? "image" : "bypass";
      }
      return "bypass"; // Supabase auth, anything else cross-origin
    }

    var p = u.pathname;
    if (p === "/sw.js") return "bypass";
    if (SHELL_FILES.indexOf(p) !== -1) return "shell";
    if (p.indexOf("/_next/static/") === 0) return "static";
    if (p.indexOf("/_next/image") === 0) return "image";
    if (p.indexOf("/_next/") === 0 || p.indexOf("/api/") === 0) return "bypass";
    if (r.mode === "navigate") {
      if (isPrivatePath(p)) return "private-page";
      return isPublicPage(p) ? "page" : "private-page"; // unknown pages are treated as private: safe by default
    }
    if (r.destination === "image" && (p.indexOf("/sample/") === 0 || p.indexOf("/icons/") === 0)) return "image";
    return "bypass"; // RSC payloads, prefetches, fetch() to the same origin: always live
  }

  /**
   * May this response be stored? `kind` is the class from `classify`.
   *   input: { kind, status, type ("basic" | "cors" | "opaque" | …), redirected, cacheControl }
   * Pages and catalog JSON must be real 200 answers (never opaque, never a redirect result). Catalog JSON from the API and public pages ignore
   * `no-store`/`private`: Spring Security adds `no-store` to every response and Next marks searchParams-driven public pages `private`, so honouring
   * them would make offline reading impossible; safety comes from the allow-lists above, not from those headers.
   * Everything else must not carry `no-store`.
   */
  function isCacheable(r) {
    if (r.kind === "bypass" || r.kind === "private-page") return false;
    if (r.kind === "image") {
      if (r.type === "opaque") return true; // <img> cross-origin without CORS: cannot be inspected, cannot contain JSON/HTML we would serve as data
      return r.status === 200;
    }
    if (r.type === "opaque" || r.type === "error") return false;
    if (r.status !== 200) return false;
    if (r.kind === "page") return !r.redirected;
    if (r.kind === "api") return true;
    if (r.kind === "shell") return true;
    if (r.kind === "static") return !/no-store/i.test(r.cacheControl || "");
    return false;
  }

  /** True when a stored catalog entry is too old to show. `storedAt` = ms epoch recorded when it was cached. */
  function isTooOld(storedAt, now) { return typeof storedAt !== "number" || !isFinite(storedAt) || now - storedAt > API_MAX_AGE_MS; }

  /** Cache key for a page or API request: the URL without its fragment (the query is part of the key: filters change the page). */
  function keyOf(url) { var u = new URL(url); u.hash = ""; return u.toString(); }

  /**
   * Cached pages to try, in order, when a navigation fails. A bare path ("/", "/cart") has no language: try the visitor's language first.
   * (A navigation to a locale path only ever falls back to ITSELF.)
   */
  function fallbackKeys(url, acceptLanguage) {
    var u = new URL(url);
    if (localeOf(u.pathname)) return [keyOf(url)];
    var preferred = /(^|[,;\s])ht\b/i.test(acceptLanguage || "") && !/(^|[,;\s])fr\b/i.test(acceptLanguage || "") ? "ht" : DEFAULT_LOCALE;
    var order = [preferred].concat(LOCALES.filter(function (l) { return l !== preferred; }));
    return order.map(function (l) {
      var c = new URL(u.toString());
      c.pathname = "/" + l + (u.pathname === "/" ? "" : u.pathname);
      return c.toString();
    });
  }

  /** `/_next/static/...` URLs mentioned in an HTML document (scripts, stylesheets, preloads and the flight payload), de-duplicated. */
  function extractStaticUrls(html) {
    var out = [];
    var re = /\/_next\/static\/[A-Za-z0-9_\-.~%/]+\.(?:js|css|woff2)/g;
    var m;
    while ((m = re.exec(html))) if (out.indexOf(m[0]) === -1) out.push(m[0]);
    return out;
  }

  /** Which of the cache kinds hold nothing private by construction but are still emptied on sign-out (see PRIVATE_KINDS). */
  function purgeNames(version) { return PRIVATE_KINDS.map(function (k) { return cacheName(version, k); }); }

  var api = {
    SHELL_FILES: SHELL_FILES, LOCALES: LOCALES, KINDS: KINDS, PRIVATE_KINDS: PRIVATE_KINDS, MAX_ENTRIES: MAX_ENTRIES, API_MAX_AGE_MS: API_MAX_AGE_MS, NETWORK_TIMEOUT_MS: NETWORK_TIMEOUT_MS,
    cacheName: cacheName, isObsoleteCache: isObsoleteCache, localeOf: localeOf, isPrivatePath: isPrivatePath, isPublicPage: isPublicPage,
    classify: classify, isCacheable: isCacheable, isTooOld: isTooOld, keyOf: keyOf, fallbackKeys: fallbackKeys, extractStaticUrls: extractStaticUrls, purgeNames: purgeNames,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AnaPolicy = api;
})(typeof self !== "undefined" ? self : this);
