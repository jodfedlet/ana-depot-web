import { describe, expect, it, vi } from "vitest";
import { createAuthApi } from "../api/auth";
import { resolveAdminAccess } from "./admin-access";
import { canAccessAdmin, hasPermission } from "./authorization";
import { createAuthStore } from "./auth-store";
import { readSupabaseConfig } from "./config";
import { mapAuthError } from "./errors";
import { fetchMe, parseMe } from "./me";
import { safeNextPath } from "./safe-next";

/**
 * MOCKED tests. The Supabase client is replaced by a hand-written fake: these tests prove OUR logic (error mapping,
 * access decisions, request shape, state transitions). They do NOT prove that a real Supabase project accepts the
 * calls — that needs a real project (see docs/auth.md) and is not covered here.
 */
const me = { userId: "u1", email: "a@b.co", emailVerified: true, staff: false, permissions: [] as string[], customerProfileId: null };

describe("config (mocked env)", () => {
  it("is null unless both values exist and the URL is https (or localhost)", () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(readSupabaseConfig({ url: "https://x.supabase.co" })).toBeNull();
    expect(readSupabaseConfig({ url: "http://evil.example", anonKey: "k" })).toBeNull();
    expect(readSupabaseConfig({ url: "not a url", anonKey: "k" })).toBeNull();
    expect(readSupabaseConfig({ url: "https://x.supabase.co", anonKey: "k" })).toEqual({ url: "https://x.supabase.co", anonKey: "k" });
    expect(readSupabaseConfig({ url: "http://127.0.0.1:54321", anonKey: "k" })).not.toBeNull();
  });
});

describe("mapAuthError", () => {
  it("maps Supabase codes, HTTP status and transport failures", () => {
    expect(mapAuthError({ code: "invalid_credentials" })).toBe("invalid_credentials");
    expect(mapAuthError({ code: "email_not_confirmed" })).toBe("email_not_confirmed");
    // "already registered" is never a screen state (privacy): the provider code is not mapped to a user-facing code
    expect(mapAuthError({ code: "user_already_exists" })).toBe("unknown");
    expect(mapAuthError({ code: "weak_password" })).toBe("weak_password");
    expect(mapAuthError({ code: "same_password" })).toBe("same_password");
    expect(mapAuthError({ code: "over_email_send_rate_limit" })).toBe("rate_limited");
    expect(mapAuthError({ status: 429 })).toBe("rate_limited");
    expect(mapAuthError({ code: "otp_expired" })).toBe("link_expired");
    expect(mapAuthError({ code: "refresh_token_not_found" })).toBe("session_expired");
    expect(mapAuthError({ name: "AuthSessionMissingError" })).toBe("session_expired");
    expect(mapAuthError({ name: "AuthRetryableFetchError", status: 0 })).toBe("network");
    expect(mapAuthError(new TypeError("Failed to fetch"))).toBe("network");
    expect(mapAuthError({ message: "Invalid login credentials" })).toBe("invalid_credentials");
    expect(mapAuthError({ message: "something odd" })).toBe("unknown");
    expect(mapAuthError(null)).toBe("unknown");
  });
});

describe("safeNextPath (no open redirects)", () => {
  it("only accepts same-site relative paths", () => {
    expect(safeNextPath("/account", "/x")).toBe("/account");
    expect(safeNextPath("/admin?tab=1", "/x")).toBe("/admin?tab=1");
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil.example", "", null, undefined, "/a\nb"]) expect(safeNextPath(bad, "/x")).toBe("/x");
  });
});

describe("authorization boundary", () => {
  it("only staff may access admin; permissions are denied by default", () => {
    expect(canAccessAdmin(me)).toBe(false);
    expect(canAccessAdmin({ ...me, staff: true })).toBe(true);
    expect(canAccessAdmin(null)).toBe(false);
    expect(hasPermission({ ...me, staff: true, permissions: ["x"] }, "x")).toBe(true);
    expect(hasPermission({ ...me, staff: true, permissions: [] }, "x")).toBe(false);
    expect(hasPermission({ ...me, staff: false, permissions: ["x"] }, "x")).toBe(false); // permissions never override a missing staff flag
  });
});

describe("parseMe / fetchMe (mocked fetch)", () => {
  it("rejects malformed bodies instead of trusting them", () => {
    expect(parseMe(me)).toEqual(me);
    expect(parseMe({ ...me, staff: "true" })).toBeNull();
    expect(parseMe({ ...me, permissions: [1] })).toBeNull();
    expect(parseMe({ ...me, userId: 5 })).toBeNull();
    expect(parseMe(null)).toBeNull();
    expect(parseMe({ ...me, customerProfileId: 7 })).toBeNull();
  });
  const res = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
  it("sends the bearer token and maps outcomes: ok / 401 / everything else = unreachable", async () => {
    const fetchImpl = vi.fn(async () => res(200, me));
    expect(await fetchMe({ apiBaseUrl: "http://api/", accessToken: "tok", fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ kind: "ok", me });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api/api/v1/me");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(await fetchMe({ apiBaseUrl: "http://api", accessToken: "t", fetchImpl: (async () => res(401)) as unknown as typeof fetch })).toEqual({ kind: "unauthorized" });
    expect(await fetchMe({ apiBaseUrl: "http://api", accessToken: "t", fetchImpl: (async () => res(500)) as unknown as typeof fetch })).toEqual({ kind: "unreachable" });
    expect(await fetchMe({ apiBaseUrl: "http://api", accessToken: "t", fetchImpl: (async () => { throw new Error("down"); }) as unknown as typeof fetch })).toEqual({ kind: "unreachable" });
    expect(await fetchMe({ apiBaseUrl: "http://api", accessToken: "t", fetchImpl: (async () => res(200, { staff: true })) as unknown as typeof fetch })).toEqual({ kind: "unreachable" });
    expect(await fetchMe({ apiBaseUrl: undefined, accessToken: "t" })).toEqual({ kind: "unreachable" });
  });
});

describe("resolveAdminAccess (default deny, mocked dependencies)", () => {
  const base = { configured: true, getVerifiedUser: async () => ({ id: "u1", email: "a@b.co" }), getAccessToken: async () => "tok", fetchMe: async () => ({ kind: "ok" as const, me: { ...me, staff: true } }) };
  it("allows only a verified session whose backend profile is staff for the same user", async () => {
    expect((await resolveAdminAccess(base)).state).toBe("allowed");
  });
  it("denies in every other situation", async () => {
    expect((await resolveAdminAccess({ ...base, configured: false })).state).toBe("not_configured");
    expect((await resolveAdminAccess({ ...base, getVerifiedUser: async () => null })).state).toBe("unauthenticated");
    // a cookie that no longer verifies means the session expired or was revoked, not "never signed in"
    expect((await resolveAdminAccess({ ...base, getVerifiedUser: async () => null, hadSession: () => true })).state).toBe("session_invalid");
    expect((await resolveAdminAccess({ ...base, getVerifiedUser: async () => null, hadSession: () => false })).state).toBe("unauthenticated");
    expect((await resolveAdminAccess({ ...base, getAccessToken: async () => null })).state).toBe("session_invalid");
    expect((await resolveAdminAccess({ ...base, fetchMe: async () => ({ kind: "unauthorized" as const }) })).state).toBe("session_invalid");
    expect((await resolveAdminAccess({ ...base, fetchMe: async () => ({ kind: "unreachable" as const }) })).state).toBe("backend_unreachable");
    expect((await resolveAdminAccess({ ...base, fetchMe: async () => ({ kind: "ok" as const, me }) })).state).toBe("forbidden"); // a customer
    expect((await resolveAdminAccess({ ...base, fetchMe: async () => ({ kind: "ok" as const, me: { ...me, staff: true, userId: "someone-else" } }) })).state).toBe("session_invalid");
  });
  it("does not even ask the backend when there is no verified user", async () => {
    const fetchMe_ = vi.fn();
    await resolveAdminAccess({ ...base, getVerifiedUser: async () => null, fetchMe: fetchMe_ });
    expect(fetchMe_).not.toHaveBeenCalled();
  });
});

type Listener = (event: string, session: { user: { id: string; email: string; email_confirmed_at: string | null; user_metadata: Record<string, unknown> } } | null) => void;
const user = { id: "u1", email: "a@b.co", email_confirmed_at: "2026-01-01", user_metadata: { first_name: "Ana" } };
function fakeClient(over: Partial<Record<string, unknown>> = {}) {
  let listener: Listener | undefined;
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { access_token: "t", user } } })),
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
    onAuthStateChange: vi.fn((cb: Listener) => { listener = cb; return { data: { subscription: { unsubscribe() {} } } }; }),
    signOut: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
    signUp: vi.fn(async () => ({ data: { user: { identities: [{}] }, session: null }, error: null })),
    resend: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    ...over,
  };
  return { client: { auth } as never, auth, emit: (e: string, s: Parameters<Listener>[1]) => listener?.(e, s) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("auth store: signed in only after Supabase confirms (mocked client)", () => {
  it("starts loading, never signed_in before getUser() succeeds", async () => {
    let resolveUser!: (v: unknown) => void;
    const f = fakeClient({ getUser: vi.fn(() => new Promise((r) => { resolveUser = r; })) });
    const store = createAuthStore(() => f.client);
    expect(store.getSnapshot().status).toBe("loading");
    store.subscribe(() => undefined);
    await flush();
    expect(store.getSnapshot().status).toBe("loading"); // session cookie present but not yet verified
    resolveUser({ data: { user }, error: null });
    await flush();
    expect(store.getSnapshot()).toMatchObject({ status: "signed_in", user: { id: "u1", email: "a@b.co", emailVerified: true, firstName: "Ana" } });
  });
  it("is signed_out without a session, when verification fails, and after a SIGNED_OUT event (revocation / other tab)", async () => {
    const none = fakeClient({ getSession: vi.fn(async () => ({ data: { session: null } })) });
    const s1 = createAuthStore(() => none.client); s1.subscribe(() => undefined); await flush();
    expect(s1.getSnapshot().status).toBe("signed_out");
    expect(none.auth.getUser).not.toHaveBeenCalled();

    const revoked = fakeClient({ getUser: vi.fn(async () => ({ data: { user: null }, error: { code: "session_not_found" } })) });
    const s2 = createAuthStore(() => revoked.client); s2.subscribe(() => undefined); await flush();
    expect(s2.getSnapshot().status).toBe("signed_out");

    const live = fakeClient();
    const s3 = createAuthStore(() => live.client); s3.subscribe(() => undefined); await flush();
    expect(s3.getSnapshot().status).toBe("signed_in");
    live.emit("SIGNED_OUT", null);
    expect(s3.getSnapshot().status).toBe("signed_out");
  });
  it("is signed_out (not simulated) when authentication is not configured", async () => {
    const s = createAuthStore(() => null); s.subscribe(() => undefined);
    expect(s.getSnapshot().status).toBe("signed_out");
    expect(await s.signOut()).toBe(false);
  });
  it("signOut() ends the Supabase session first and only then updates the UI; a failure keeps the user signed in", async () => {
    const f = fakeClient();
    const s = createAuthStore(() => f.client); s.subscribe(() => undefined); await flush();
    expect(await s.signOut()).toBe(true);
    expect(f.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(s.getSnapshot().status).toBe("signed_out");
    const bad = fakeClient({ signOut: vi.fn(async () => ({ error: { code: "x" } })) });
    const s2 = createAuthStore(() => bad.client); s2.subscribe(() => undefined); await flush();
    expect(await s2.signOut()).toBe(false);
    expect(s2.getSnapshot().status).toBe("signed_in");
  });
});

describe("auth API (mocked Supabase client)", () => {
  const api = (f: ReturnType<typeof fakeClient>) => createAuthApi(() => f.client, () => "https://shop.example");
  it("is 'not_configured' without a client: never a fake success", async () => {
    const a = createAuthApi(() => null, () => "https://x");
    expect(await a.signIn("a@b.co", "pw")).toEqual({ ok: false, error: "not_configured" });
    expect(await a.register({ firstName: "A", lastName: "B", email: "a@b.co", password: "12345678", locale: "fr" })).toEqual({ ok: false, error: "not_configured" });
    expect(await a.requestPasswordReset("a@b.co", "fr")).toEqual({ ok: false, error: "not_configured" });
  });
  it("signIn passes credentials to Supabase and returns its error codes (invalid credentials, unverified e-mail)", async () => {
    const f = fakeClient();
    expect(await api(f).signIn(" a@b.co ", "secret")).toEqual({ ok: true, data: undefined });
    expect(f.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "secret" });
    const bad = fakeClient({ signInWithPassword: vi.fn(async () => ({ data: {}, error: { code: "invalid_credentials" } })) });
    expect(await api(bad).signIn("a@b.co", "x")).toEqual({ ok: false, error: "invalid_credentials" });
    const unverified = fakeClient({ signInWithPassword: vi.fn(async () => ({ data: {}, error: { code: "email_not_confirmed" } })) });
    expect(await api(unverified).signIn("a@b.co", "x")).toEqual({ ok: false, error: "email_not_confirmed" });
    const down = fakeClient({ signInWithPassword: vi.fn(async () => { throw new TypeError("Failed to fetch"); }) });
    expect(await api(down).signIn("a@b.co", "x")).toEqual({ ok: false, error: "network" });
  });
  it("register: verification redirect + metadata for display, needsVerification, no account-existence disclosure", async () => {
    const f = fakeClient();
    const r = await api(f).register({ firstName: " Ana ", lastName: "Depot", email: "a@b.co", password: "12345678", locale: "ht" });
    expect(r).toEqual({ ok: true, data: { needsVerification: true } });
    const arg = (f.auth.signUp.mock.calls[0] as unknown as [{ email: string; options: { emailRedirectTo: string; data: Record<string, string> } }])[0];
    expect(arg.options.emailRedirectTo).toBe("https://shop.example/ht/auth/callback?next=%2Fverify-email%3Fstatus%3Dsuccess");
    expect(arg.options.data).toEqual({ first_name: "Ana", last_name: "Depot", locale: "ht" });
    const dup = fakeClient({ signUp: vi.fn(async () => ({ data: { user: { identities: [] }, session: null }, error: null })) });
    // already-registered addresses look EXACTLY like new ones, whichever way the provider reports them
    expect(await api(dup).register({ firstName: "A", lastName: "B", email: "a@b.co", password: "12345678", locale: "fr" })).toEqual({ ok: true, data: { needsVerification: true } });
    const exists422 = fakeClient({ signUp: vi.fn(async () => ({ data: {}, error: { code: "user_already_exists", status: 422, message: "User already registered" } })) });
    expect(await api(exists422).register({ firstName: "A", lastName: "B", email: "a@b.co", password: "12345678", locale: "fr" })).toEqual({ ok: true, data: { needsVerification: true } });
    const emailExists = fakeClient({ signUp: vi.fn(async () => ({ data: {}, error: { code: "email_exists", status: 422 } })) });
    expect(await api(emailExists).register({ firstName: "A", lastName: "B", email: "a@b.co", password: "12345678", locale: "fr" })).toEqual({ ok: true, data: { needsVerification: true } });
    const instant = fakeClient({ signUp: vi.fn(async () => ({ data: { user: { identities: [{}] }, session: { access_token: "t" } }, error: null })) });
    expect(await api(instant).register({ firstName: "A", lastName: "B", email: "a@b.co", password: "12345678", locale: "fr" })).toEqual({ ok: true, data: { needsVerification: false } });
    const weak = fakeClient({ signUp: vi.fn(async () => ({ data: {}, error: { code: "weak_password" } })) });
    expect(await api(weak).register({ firstName: "A", lastName: "B", email: "a@b.co", password: "12345678", locale: "fr" })).toEqual({ ok: false, error: "weak_password" });
  });
  it("recovery: reset e-mail redirects through the callback; updating the password needs a recovery session", async () => {
    const f = fakeClient();
    await api(f).requestPasswordReset("a@b.co", "fr");
    expect(f.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: "https://shop.example/fr/auth/callback?next=%2Freset-password" });
    expect(await api(f).resetPassword("new-password-1")).toEqual({ ok: true, data: undefined });
    expect(f.auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
    const noSession = fakeClient({ getSession: vi.fn(async () => ({ data: { session: null } })) });
    expect(await api(noSession).resetPassword("new-password-1")).toEqual({ ok: false, error: "link_expired" });
    expect(noSession.auth.updateUser).not.toHaveBeenCalled();
    const same = fakeClient({ updateUser: vi.fn(async () => ({ error: { code: "same_password" } })) });
    expect(await api(same).resetPassword("x")).toEqual({ ok: false, error: "same_password" });
  });
  it("resend uses the signup flow with the callback redirect", async () => {
    const f = fakeClient();
    expect(await api(f).resendVerification("a@b.co", "fr")).toEqual({ ok: true, data: undefined });
    expect(f.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.co", options: { emailRedirectTo: "https://shop.example/fr/auth/callback?next=%2Fverify-email%3Fstatus%3Dsuccess" } });
    const limited = fakeClient({ resend: vi.fn(async () => ({ error: { code: "over_email_send_rate_limit" } })) });
    expect(await api(limited).resendVerification("a@b.co", "fr")).toEqual({ ok: false, error: "rate_limited" });
  });
});

describe("Supabase key env names (mocked env)", () => {
  it("accepts the publishable key or the legacy anon key, publishable first", async () => {
    const { vi: v } = await import("vitest");
    v.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    v.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    v.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { getSupabaseConfig } = await import("./config");
    expect(getSupabaseConfig()?.anonKey).toBe("anon-key");
    v.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pub-key");
    expect(getSupabaseConfig()?.anonKey).toBe("pub-key");
    v.unstubAllEnvs();
  });
});
