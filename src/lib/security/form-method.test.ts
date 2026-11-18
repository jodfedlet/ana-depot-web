import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A form that collects a password, an e-mail address, a phone number or a reservation reference must never fall back to a native GET submit (before
 * the page has hydrated, or with scripts blocked): that would put the secret in the address bar, the history and the access logs. `method="post"` keeps it out of the URL.
 */
const SENSITIVE_FORM_FILES = [
  "src/components/auth-block/login-form.tsx",
  "src/components/auth-block/sign-up-form.tsx",
  "src/components/auth-block/update-password-form.tsx",
  "src/components/auth-block/forgot-password-form.tsx",
  "src/features/account/account-views.tsx",
  "src/features/payments/payment-return.tsx",
  "src/features/reservations/reserve-flow.tsx",
  "src/features/reservations/track-views.tsx",
];

describe("forms with personal data or credentials never submit through the URL", () => {
  for (const file of SENSITIVE_FORM_FILES) {
    it(file, () => {
      const forms = readFileSync(file, "utf8").match(/<form\b[^>]*>/g) ?? [];
      expect(forms.length).toBeGreaterThan(0);
      for (const tag of forms) expect(tag).toMatch(/method="post"/);
    });
  }
});
