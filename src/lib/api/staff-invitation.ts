import { signedInClient } from "./session-client";

/** The signed-in person redeems the one-time code the store gave them. The API decides everything; a wrong, used, revoked or expired code is one and the same "invitation_invalid". */
export async function redeemInvitation(code: string): Promise<{ joined: boolean }> {
  return (await signedInClient()).post<{ joined: boolean }>("/api/v1/me/staff-invitation", { code });
}
