import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fr } from "@/i18n/messages/fr";
import { ht } from "@/i18n/messages/ht";

/** Static guards (mocked/unit level, no browser): the Supabase UI block is the ONLY place that renders sign-in/up/recovery inputs. */
const root = path.resolve(import.meta.dirname, "../../..");
const src = path.join(root, "src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(src).filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith(".test.ts"));
const block = path.join(src, "components", "auth-block");

describe("old custom auth UI is gone", () => {
  it.each([
    "src/features/auth",
    "src/features/admin/admin-signin.tsx",
    "src/app/[locale]/(store)/(auth)",
    "src/app/[locale]/admin/sign-in",
  ])("%s does not exist", (p) => expect(existsSync(path.join(root, p))).toBe(false));

  it("no route or link points at the removed paths (they only exist as redirects in next.config.ts)", () => {
    const offenders = files.filter((f) => /["'`](\/[a-z]{2}\/)?(sign-in|register|forgot-password|reset-password|verify-email|admin\/sign-in)\b/.test(readFileSync(f, "utf8")) && !f.includes("/auth/callback/"));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("@supabase/auth-ui-react is not a dependency", () => {
    const pkg = readFileSync(path.join(root, "package.json"), "utf8");
    expect(pkg).not.toContain("auth-ui-react");
    expect(pkg).not.toContain("@supabase/auth-ui");
  });
});

describe("auth inputs live only in the block", () => {
  it("no password input, PasswordField, or sign-in wording outside components/auth-block (except the admin/account areas never rendering one)", () => {
    const offenders = files.filter((f) => !f.startsWith(block) && /type=["']password["']|PasswordField|signInWithPassword|signUp\(|resetPasswordForEmail|updateUser\(/.test(readFileSync(f, "utf8")));
    // lib/api/auth.ts is the single thin call layer (no UI); field.tsx defines the generic PasswordField primitive that nothing renders for auth any more.
    expect(offenders.map((f) => path.relative(root, f)).sort()).toEqual(["src/components/ui/field.tsx", "src/lib/api/auth.ts"]);
  });

  it("PasswordField is not used by any screen", () => {
    const users = files.filter((f) => !f.endsWith("ui/field.tsx") && /<PasswordField/.test(readFileSync(f, "utf8")));
    expect(users).toEqual([]);
  });

  it("every auth page renders through AuthPage (the unavailable-state gate) except the input-less error page", () => {
    const dir = path.join(src, "app", "[locale]", "(store)", "auth");
    const pages = readdirSync(dir).filter((d) => statSync(path.join(dir, d)).isDirectory());
    expect(pages.sort()).toEqual(["error", "forgot-password", "login", "sign-up", "sign-up-success", "update-password"]);
    for (const d of pages) {
      const code = readFileSync(path.join(dir, d, "page.tsx"), "utf8");
      if (d === "error") expect(code).not.toMatch(/<Input|<form/);
      else expect(code, d).toContain("<AuthPage");
    }
  });

  it("AuthPage swaps the block for AuthUnavailable when the configuration is invalid, and that state has no inputs", () => {
    const page = readFileSync(path.join(block, "auth-page.tsx"), "utf8");
    expect(page).toMatch(/getSupabaseConfig\(\) \? children : <AuthUnavailable/);
    const un = readFileSync(path.join(block, "auth-unavailable.tsx"), "utf8");
    expect(un).not.toMatch(/<Input|<form|<input|type=["']password/);
  });

  it("'Continue as guest' is a plain link outside any <form>", () => {
    const login = readFileSync(path.join(block, "login-form.tsx"), "utf8");
    // login-form must not contain the guest link: it lives in the page, outside the Supabase form area
    expect(login).not.toContain("guest");
    const page = readFileSync(path.join(src, "app", "[locale]", "(store)", "auth", "login", "page.tsx"), "utf8");
    expect(page).toContain("GuestLink");
  });

  it("the block uses the app's single Supabase client (no second createClient / createBrowserClient)", () => {
    const offenders = files.filter((f) => /createBrowserClient|createServerClient|createClient\(/.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f)).sort();
    expect(offenders).toEqual(["src/lib/auth/proxy-session.ts", "src/lib/auth/supabase-browser.ts", "src/lib/auth/supabase-server.ts"]);
  });
});

describe("auth strings", () => {
  const flat = (o: unknown, prefix = ""): Record<string, string> =>
    typeof o === "string" ? { [prefix]: o } : Object.entries(o as object).reduce((a, [k, v]) => ({ ...a, ...flat(v, prefix ? `${prefix}.${k}` : k) }), {});
  const a = { fr: flat(fr.auth), ht: flat(ht.auth) };

  it("fr and ht define exactly the same auth keys, and every Supabase error code the UI can show has a message in both", () => {
    expect(Object.keys(a.ht).sort()).toEqual(Object.keys(a.fr).sort());
    for (const k of ["invalid_credentials", "email_not_confirmed", "weak_password", "same_password", "rate_limited", "network", "session_expired", "link_expired", "not_configured", "unknown"]) {
      expect(a.fr[`errors.${k}`], k).toBeTruthy();
      expect(a.ht[`errors.${k}`], k).toBeTruthy();
    }
  });

  it("ht strings are never left identical to French (except placeholders and proper nouns)", () => {
    const same = Object.keys(a.fr).filter((k) => a.fr[k] === a.ht[k] && !/^emailPlaceholder$/.test(k));
    expect(same).toEqual([]);
  });
});

describe("the block's UI primitives are the registry's shadcn components", () => {
  it.each(["button", "card", "input", "label"])("ui/%s.tsx is the shadcn registry file and says where it comes from", (name) => {
    const file = path.join(block, "ui", `${name}.tsx`);
    expect(existsSync(file)).toBe(true);
    const code = readFileSync(file, "utf8");
    expect(code).toContain(`https://ui.shadcn.com/r/styles/new-york-v4/${name}.json`);
    expect(code).toContain("https://supabase.com/ui/r/password-based-auth-nextjs.json");
    expect(code).toContain('data-slot="' + (name === "label" ? "label" : name) + '"');
  });

  it("the hand-written look-alike primitives are gone", () => {
    expect(existsSync(path.join(block, "primitives.tsx"))).toBe(false);
    const offenders = files.filter((f) => /auth-block\/primitives|\.\/primitives["']/.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });

  it("every block form and the auth pages build on ./ui (never on the app's own Button/Input)", () => {
    const forms = ["login-form", "sign-up-form", "forgot-password-form", "update-password-form", "sign-up-success", "auth-unavailable", "logout-button"];
    for (const f of forms) {
      const code = readFileSync(path.join(block, `${f}.tsx`), "utf8");
      expect(code, f).toMatch(/from "\.\/ui\/(button|card)"/);
      expect(code, f).not.toMatch(/from "@\/components\/ui\/(button|field|input)"/);
    }
    const error = readFileSync(path.join(src, "app", "[locale]", "(store)", "auth", "error", "page.tsx"), "utf8");
    expect(error).toContain("@/components/auth-block/ui/card");
  });

  it("the shadcn colour names resolve to Ana tokens (one palette, no second theme)", () => {
    const css = readFileSync(path.join(src, "app", "globals.css"), "utf8");
    for (const [name, token] of [["primary", "brand-700"], ["background", "canvas"], ["accent", "accent-100"], ["ring", "brand-600"]] as const) {
      expect(css).toContain(`--color-${name}: var(--color-${token});`);
    }
  });
});
