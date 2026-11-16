/**
 * STUB, NOT SUPABASE. TEST HARNESS ONLY. A tiny local stand-in for (1) the Supabase Auth REST API and (2) the Ana Dépôt API's GET /api/v1/me,
 * so browser tests can exercise the real app code paths without a Supabase project. It is never part of the application.
 * Fixed users: alex.sample@example.com / "correct horse" (customer), staff@example.com / "secret-pass" (staff),
 * unverified@example.com / "secret-pass" (e-mail not confirmed).
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.STUB_PORT ?? 54399);
const users = new Map(); // email -> { id, email, password, confirmed, meta }
const add = (email, password, confirmed = true, meta = {}) => users.set(email, { id: crypto.randomUUID(), email, password, confirmed, meta });
const reset = () => { users.clear(); add("alex.sample@example.com", "correct horse", true, { first_name: "Alex" }); add("staff@example.com", "secret-pass", true, { first_name: "Staff" }); add("unverified@example.com", "secret-pass", false); };
reset();
const tokens = new Map(); // access token -> email
const refresh = new Map(); // refresh token -> email
const log = []; // received requests (for assertions)
let backendMode = "ok"; // ok | down | malformed
let revokeAll = false;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.confirmed ? "2026-01-01T00:00:00Z" : null, phone: "", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: u.meta, identities: [{ identity_id: crypto.randomUUID(), id: u.id, user_id: u.id, provider: "email", identity_data: { email: u.email, sub: u.id } }], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" });
function session(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, email: u.email, aud: "authenticated", role: "authenticated", exp, iat: exp - 3600, session_id: crypto.randomUUID(), aal: "aal1", amr: [{ method: "password", timestamp: exp - 3600 }], is_anonymous: false })}.stub`;
  const rt = crypto.randomBytes(8).toString("hex");
  tokens.set(access, u.email); refresh.set(rt, u.email);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: rt, user: userJson(u) };
}
const bearer = (req) => (req.headers.authorization ?? "").replace(/^Bearer /, "");
const who = (req) => (revokeAll ? null : users.get(tokens.get(bearer(req)) ?? ""));
const send = (res, status, body, extra = {}) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", ...extra }); res.end(body === undefined ? "" : JSON.stringify(body)); };
const err = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") return send(res, 204);
  let body = {};
  if (req.method !== "GET") { const chunks = []; for await (const c of req) chunks.push(c); try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { body = {}; } }
  const p = url.pathname;
  if (!p.startsWith("/__")) log.push({ method: req.method, path: p, query: Object.fromEntries(url.searchParams), body: JSON.parse(JSON.stringify(body, (k, v) => (k === "password" ? "[redacted]" : v))) });

  // ---- control plane for the tests
  if (p === "/__reset") { reset(); tokens.clear(); refresh.clear(); log.length = 0; backendMode = "ok"; revokeAll = false; return send(res, 200, {}); }
  if (p === "/__log") return send(res, 200, log);
  if (p === "/__backend") { backendMode = url.searchParams.get("mode") ?? "ok"; return send(res, 200, {}); }
  if (p === "/__revoke") { revokeAll = url.searchParams.get("on") !== "0"; return send(res, 200, {}); }

  // ---- Ana Dépôt API
  if (p === "/api/v1/me") {
    if (backendMode === "down") return send(res, 503, { code: "unavailable" });
    const u = who(req);
    if (!u) return send(res, 401, { code: "unauthorized" });
    if (backendMode === "malformed") return send(res, 200, { staff: "yes" });
    return send(res, 200, { userId: u.id, email: u.email, emailVerified: u.confirmed, staff: u.email.startsWith("staff@"), permissions: [], customerProfileId: null });
  }

  // ---- Supabase Auth
  if (p === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    if (String(body.email ?? "").toLowerCase() === "ratelimit@example.com") return err(res, 429, "over_request_rate_limit", "Request rate limit reached");
    const u = users.get(String(body.email ?? "").toLowerCase());
    if (!u || u.password !== body.password) return err(res, 400, "invalid_credentials", "Invalid login credentials");
    if (!u.confirmed) return err(res, 400, "email_not_confirmed", "Email not confirmed");
    return send(res, 200, session(u));
  }
  if (p === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
    const email = body.auth_code === "good-code" ? "alex.sample@example.com" : body.auth_code === "staff-code" ? "staff@example.com" : null;
    if (!email) return err(res, 400, "flow_state_not_found", "invalid flow state, no valid flow state found");
    return send(res, 200, session(users.get(email)));
  }
  if (p === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const email = refresh.get(body.refresh_token);
    return email && !revokeAll ? send(res, 200, session(users.get(email))) : err(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
  }
  if (p === "/auth/v1/signup") {
    const email = String(body.email ?? "").toLowerCase();
    if (String(body.password ?? "").length < 8 || body.password === "password") return err(res, 422, "weak_password", "Password should be at least 8 characters.");
    const existing = users.get(email);
    if (existing) return err(res, 422, "user_already_exists", "User already registered"); // what the REAL GoTrue v2.184 answers for a confirmed account
    add(email, body.password, false, body.data ?? {});
    return send(res, 200, userJson(users.get(email)));
  }
  if (p === "/auth/v1/user") {
    const u = who(req);
    if (!u) return err(res, 401, "bad_jwt", "invalid JWT");
    if (req.method === "PUT") {
      if (body.password && body.password === u.password) return err(res, 422, "same_password", "New password should be different from the old password.");
      if (body.password) u.password = body.password;
    }
    return send(res, 200, userJson(u));
  }
  if (p === "/auth/v1/logout") { tokens.delete(bearer(req)); return send(res, 204); }
  if (p === "/auth/v1/recover" || p === "/auth/v1/resend") return send(res, 200, {});
  return err(res, 404, "not_found", `stub: no route ${req.method} ${p}`);
}).listen(PORT, "127.0.0.1", () => console.log(`auth stub on ${PORT}`));
