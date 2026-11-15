"use client";

import { createPersistedStore } from "./create-persisted-store";

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  dialCode: string;
  phone: string;
}

/** DEMO customer profile, edited locally in this browser only. Seeded from sample data. */
const store = createPersistedStore<Profile>("ana.demo.profile.v2", {
  firstName: "Alex",
  lastName: "Sample",
  email: "alex.sample@example.com",
  dialCode: "+509",
  phone: "0000 0101",
});

export function useProfile() {
  const profile = store.useStore();
  return { profile, updateProfile: (patch: Partial<Profile>) => store.set((p) => ({ ...p, ...patch })) };
}
