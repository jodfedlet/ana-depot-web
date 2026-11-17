/*
 * Ana Dépôt service worker. Served as /sw.js by `app/sw.js/route.ts`, which puts a `const ANA_SW = { version, apiOrigin, assetOrigins }` line and
 * `policy.js` (the pure cache rules, global `AnaPolicy`) in front of this file. Hand-written on purpose: ~200 lines that can be audited, no build plugin.
 *
 * What it does (see docs/pwa.md for the full table):
 *   static  /_next/static/**        cache-first (content-hashed files)
 *   page    public storefront pages network-first (4s), cached copy when offline
 *   api     public catalog JSON     network-first (4s), cached copy (<= 24h) when the network fails, the page is told ("stale")
 *   image   images                  stale-while-revalidate
 *   everything else (admin, account, auth, reservations, anything with Authorization, POST/PUT/..., Supabase)  -> NOT intercepted, never cached.
 * It never queues, replays or fakes a write. Offline, a private navigation gets the offline notice (HTTP 503), never a stale copy.
 */
/* global ANA_SW, AnaPolicy, self, caches, clients, fetch, Response, Request */
"use strict";

var P = AnaPolicy;
var VERSION = ANA_SW.version;
var OFFLINE_URL = "/offline.html";
var STORED_AT = "x-ana-stored-at";
var name = function (kind) { return P.cacheName(VERSION, kind); };

/** Public pages that are pre-fetched at install so the cart and home open offline even if the visitor never opened them. */
var PRECACHE_PAGES = P.LOCALES.flatMap(function (l) { return ["/" + l, "/" + l + "/cart"]; });

self.addEventListener("install", function (event) {
  // No skipWaiting here: a new version waits until the page offers "refresh" (SKIP_WAITING message) or every tab is closed.
  event.waitUntil(precache());
});

async function precache() {
  var shell = await caches.open(name("shell"));
  // required: install fails if the offline notice cannot be stored
  await Promise.all(P.SHELL_FILES.map(function (f) { return shell.add(new Request(f, { cache: "reload", credentials: "omit" })); }));
  // Best effort: a failure here must not block the install.
  await Promise.all(PRECACHE_PAGES.map(function (path) { return cachePage(path).catch(function () {}); }));
}

/** Fetches a public page WITHOUT credentials, stores it, and stores the hashed assets it references. */
async function cachePage(path) {
  var url = new URL(path, self.location.origin).toString();
  var res = await fetch(url, { credentials: "omit", cache: "reload" });
  var kind = P.classify({ url: url, method: "GET", mode: "navigate", origin: self.location.origin, apiOrigin: ANA_SW.apiOrigin, assetOrigins: ANA_SW.assetOrigins });
  if (kind !== "page" || !P.isCacheable({ kind: kind, status: res.status, type: res.type, redirected: res.redirected, cacheControl: res.headers.get("cache-control") })) return;
  var html = await res.clone().text();
  await put("pages", url, res);
  await Promise.all(P.extractStaticUrls(html).map(function (asset) { return cacheStatic(asset).catch(function () {}); }));
}

async function cacheStatic(path) {
  var url = new URL(path, self.location.origin).toString();
  var c = await caches.open(name("static"));
  if (await c.match(url)) return;
  var res = await fetch(url, { credentials: "omit" });
  if (P.isCacheable({ kind: "static", status: res.status, type: res.type, cacheControl: res.headers.get("cache-control") })) { await c.put(url, res); await trim("static"); }
}

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return P.isObsoleteCache(k, VERSION); }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener("message", function (event) {
  var data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  else if (data.type === "PURGE_PRIVATE") event.waitUntil(purge());
  else if (data.type === "PING" && event.source) event.source.postMessage({ type: "STATUS", stale: staleClients.has(event.source.id) });
  else if (data.type === "CACHE_LOADED" && Array.isArray(data.urls)) event.waitUntil(cacheLoaded(data.urls.slice(0, 120), data.page));
});

/** Sign-out / session end: forget every page and every catalog answer stored for offline use. (Nothing private is stored by design; this is defence in depth.) */
async function purge() {
  await Promise.all(P.purgeNames(VERSION).map(function (n) { return caches.delete(n); }));
}

/**
 * The first visit is not controlled by the worker yet, so the page reports what it has already loaded; the worker keeps the parts it is allowed to keep
 * (every URL is checked by the same `classify`, a page cannot make it cache anything the rules forbid).
 */
async function cacheLoaded(urls, page) {
  await Promise.all(urls.map(async function (raw) {
    try {
      var url = new URL(raw, self.location.origin).toString();
      var kind = P.classify({ url: url, method: "GET", mode: "cors", destination: /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(url) ? "image" : "", origin: self.location.origin, apiOrigin: ANA_SW.apiOrigin, assetOrigins: ANA_SW.assetOrigins });
      if (kind === "static") await cacheStatic(url);
    } catch { /* ignore */ }
  }));
  // The page itself (a public one only; `cachePage` checks the rules and fetches it WITHOUT credentials).
  try { var pageUrl = new URL(String(page), self.location.origin); if (pageUrl.origin === self.location.origin) await cachePage(pageUrl.pathname + pageUrl.search); } catch { /* ignore */ }
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  var kind = P.classify({
    url: req.url, method: req.method, mode: req.mode, destination: req.destination, origin: self.location.origin,
    hasAuthorization: req.headers.has("authorization"), hasRange: req.headers.has("range"), apiOrigin: ANA_SW.apiOrigin, assetOrigins: ANA_SW.assetOrigins,
  });
  if (kind === "bypass") return; // not intercepted: the browser does its normal, uncached thing
  if (kind === "static") event.respondWith(cacheFirst(req, "static", kind));
  else if (kind === "shell") event.respondWith(cacheFirst(req, "shell", kind));
  else if (kind === "image") event.respondWith(staleWhileRevalidate(event, kind));
  else if (kind === "page") event.respondWith(networkFirst(event, "pages", kind, true));
  else if (kind === "api") event.respondWith(networkFirst(event, "api", kind, false));
  else if (kind === "private-page") event.respondWith(privatePage(req));
});

// ---- strategies ------------------------------------------------------------------------------------------------------------------------------

async function cacheFirst(req, cacheKind, kind) {
  var c = await caches.open(name(cacheKind));
  var hit = await c.match(req, { ignoreVary: true });
  if (hit) return hit;
  var res = await fetch(req);
  if (P.isCacheable(describe(kind, res))) { await c.put(req, res.clone()); await trim(cacheKind); }
  return res;
}

async function staleWhileRevalidate(event, kind) {
  var req = event.request;
  var c = await caches.open(name("images"));
  var hit = await c.match(req, { ignoreVary: true });
  var network = fetch(req).then(async function (res) {
    if (P.isCacheable(describe(kind, res))) { await c.put(req, res.clone()); await trim("images"); }
    return res;
  });
  if (hit) { event.waitUntil(network.catch(function () {})); return hit; }
  return network;
}

/**
 * Network first. With a cached copy the network gets 4s, then the copy is used (and the page is told it is showing saved data); without one the
 * request simply waits for the network. `isPage` adds the offline notice as the last resort for navigations.
 */
async function networkFirst(event, cacheKind, kind, isPage) {
  var req = event.request;
  var key = P.keyOf(req.url);
  var cached = await lookup(cacheKind, req, key, isPage);
  var network = fetch(req).then(async function (res) {
    var d = describe(kind, res);
    if (P.isCacheable(d)) await put(cacheKind, key, res);
    return res;
  });
  try {
    if (!cached) return await network;
    var timeout = new Promise(function (_, reject) { setTimeout(reject, P.NETWORK_TIMEOUT_MS, new Error("timeout")); });
    return await Promise.race([network, timeout]);
  } catch (e) {
    event.waitUntil(network.catch(function () {})); // let a slow answer still refresh the copy
    if (cached) { await tellStale(event); return cached; }
    if (isPage) { var alt = await fallbackPage(req); if (alt) { await tellStale(event); return alt; } return offlineNotice(); }
    throw e; // the page's own error handling shows "connection problem" (no invented data)
  }
}

/** Navigation that must never be served from a cache (admin, account, auth, reservations…): network, or the offline notice. */
async function privatePage(req) {
  try { return await fetch(req); } catch { return offlineNotice(); }
}

async function lookup(cacheKind, req, key, isPage) {
  var c = await caches.open(name(cacheKind));
  var hit = await c.match(key, { ignoreVary: true });
  if (!hit) return null;
  if (!isPage && P.isTooOld(Number(hit.headers.get(STORED_AT)), Date.now())) { await c.delete(key); return null; }
  return hit;
}

async function fallbackPage(req) {
  var c = await caches.open(name("pages"));
  var keys = P.fallbackKeys(req.url, req.headers.get("accept-language"));
  for (var i = 0; i < keys.length; i++) { var hit = await c.match(keys[i], { ignoreVary: true }); if (hit) return hit; }
  return null;
}

async function offlineNotice() {
  var c = await caches.open(name("shell"));
  var page = await c.match(OFFLINE_URL);
  var body = page ? await page.text() : "<!doctype html><meta charset=utf-8><title>Hors connexion</title><p>Hors connexion / Pa gen koneksyon.";
  return new Response(body, { status: 503, statusText: "Offline", headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// ---- helpers ---------------------------------------------------------------------------------------------------------------------------------

function describe(kind, res) { return { kind: kind, status: res.status, type: res.type, redirected: res.redirected, cacheControl: res.headers.get("cache-control") }; }

/** Stores a copy with the time it was stored (used to refuse catalog data older than 24h). */
async function put(cacheKind, key, res) {
  var copy = res.clone();
  var headers = new Headers(copy.headers);
  headers.set(STORED_AT, String(Date.now()));
  var body = await copy.blob();
  var c = await caches.open(name(cacheKind));
  await c.put(key, new Response(body, { status: copy.status, statusText: copy.statusText, headers: headers }));
  await trim(cacheKind);
}

/** Oldest entries go first (Cache keeps insertion order). */
async function trim(cacheKind) {
  var c = await caches.open(name(cacheKind));
  var keys = await c.keys();
  var extra = keys.length - P.MAX_ENTRIES[cacheKind];
  for (var i = 0; i < extra; i++) await c.delete(keys[i]);
}

/** Windows whose content came from a saved copy because the network failed. A navigation's new page does not exist yet to receive a message, so its id is remembered and answered to its PING. */
var staleClients = new Set();
/** Tells the page that it is showing saved data, so it can say so (the page never claims data is current when it is not). Only THAT window is marked: a later, live page is not. */
async function tellStale(event) {
  if (event.resultingClientId) { // a navigation: the new window asks (PING) when it starts
    staleClients.add(event.resultingClientId);
    if (staleClients.size > 200) staleClients.delete(staleClients.values().next().value);
    return;
  }
  var target = event.clientId ? await clients.get(event.clientId) : null;
  if (target) { staleClients.add(target.id); target.postMessage({ type: "SERVED_FROM_CACHE" }); }
}
