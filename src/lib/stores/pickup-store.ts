"use client";

import { samplePickupHistory, samplePickupSettings } from "../mock/pickup";
import type { PickupChange, PickupSettings } from "../pickup/types";
import { createPersistedStore } from "./create-persisted-store";

export interface PickupState {
  settings: PickupSettings;
  history: PickupChange[];
}

/** DEMO storage of the global pickup configuration and its change history (browser only). */
export const pickupStore = createPersistedStore<PickupState>("ana.demo.pickup.v2", {
  settings: samplePickupSettings,
  history: samplePickupHistory,
});
export const usePickup = () => pickupStore.useStore();
