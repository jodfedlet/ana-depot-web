"use client";

import { createPersistedStore } from "./create-persisted-store";

/** References this browser has verified (by phone) as a guest. Lets guests reopen their reservations. */
const store = createPersistedStore<string[]>("ana.demo.guestrefs.v1", []);
export const useVerifiedReferences = () => store.useStore();
export const rememberReference = (reference: string) => store.set((prev) => (prev.includes(reference) ? prev : [reference, ...prev]));
export const getVerifiedReferences = () => store.getSnapshot();
