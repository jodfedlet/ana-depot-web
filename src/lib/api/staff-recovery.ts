import { signedInClient } from "./session-client";

/**
 * Second-factor recovery codes (D15). Redeeming works with a password-only session (that is its purpose); making a set needs a session that is already allowed in.
 * The backend decides everything; the codes are shown once and never stored in the browser.
 */
export async function redeemRecoveryCode(code: string): Promise<{ recovered: boolean; expiresAt: string; remaining: number }> {
  return (await signedInClient()).post<{ recovered: boolean; expiresAt: string; remaining: number }>("/api/v1/me/staff-recovery/redeem", { code });
}
