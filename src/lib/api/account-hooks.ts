"use client";

import { useApiResource } from "./use-resource";
import { getProfile } from "./public";

/** The signed-in customer's own profile record (`GET /me/profile`). Before anything was saved only `email` (the account e-mail) is filled. */
export function useCustomerProfile() {
  return useApiResource("profile", (signal) => getProfile({ signal }));
}
