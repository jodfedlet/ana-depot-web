// LOCAL STUB of the Ana Dépôt API for e2e/real-supabase/auth-flows.mjs. It does NOT validate JWTs (the real backend does, through JWKS): it only echoes the claims of
// the bearer token and records which authenticated paths were called, so the web app's session wiring can be observed. It is not evidence about the backend.
// Run: node e2e/real-supabase/stub-api.mjs   (listens on 127.0.0.1:8086)
import http from "node:http";

const claims = (auth) => { try { return JSON.parse(Buffer.from(auth.split(" ")[1].split(".")[1], "base64url").toString()); } catch { return null; } };
const calls = [];
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (c, b) => { res.writeHead(c, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" }); res.end(JSON.stringify(b)); };
  if (req.method === "OPTIONS") return send(204, {});
  const c = claims(req.headers.authorization ?? "");
  if (c && u.pathname.startsWith("/api/v1/me")) calls.push({ path: u.pathname, sub: c.sub });
  if (u.pathname === "/api/v1/me") return c ? send(200, { userId: c.sub, email: c.email ?? "", emailVerified: true, staff: false, mfaRequired: false, mfaRecovered: false, role: null, permissions: [], customerProfileId: null }) : send(401, { code: "unauthenticated" });
  if (u.pathname === "/api/v1/me/profile") return c ? send(200, { email: c.email ?? "", firstName: null, lastName: null, phone: null, preferredLocale: null }) : send(401, {});
  if (u.pathname === "/api/v1/me/reservations") return c ? send(200, { items: [], page: 0, size: 10, totalItems: 0, totalPages: 0 }) : send(401, {});
  if (u.pathname === "/api/v1/categories") return send(200, []);
  if (u.pathname === "/api/v1/products") return send(200, { items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 });
  if (u.pathname === "/__calls") return send(200, calls);
  send(404, { code: "not_found" });
}).listen(8086, "127.0.0.1", () => console.log("stub api on 127.0.0.1:8086"));
