"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny localStorage-backed external store (no dependency). Hydration-safe: the server
 * snapshot is always `initial`; the client reads storage lazily after hydration.
 * Used ONLY for demo/local state (cart snapshot, region, demo session, demo orders).
 * Real persistence belongs to the backend.
 */
export function createPersistedStore<T>(key: string, initial: T) {
  let state = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  const load = () => {
    try {
      const raw = window.localStorage.getItem(key);
      state = raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      state = initial; // storage blocked or corrupt: behave as empty
    }
    loaded = true;
  };

  const emit = () => listeners.forEach((l) => l());

  const getSnapshot = () => {
    if (!loaded && typeof window !== "undefined") load();
    return state;
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        load();
        emit();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  const set = (next: T | ((prev: T) => T)) => {
    const prev = getSnapshot();
    state = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore quota/blocked storage: state still lives in memory for this tab */
    }
    emit();
  };

  const useStore = () => useSyncExternalStore(subscribe, getSnapshot, () => initial);
  return { useStore, set, getSnapshot };
}

const subscribeNever = () => () => {};
/** False during SSR and hydration, true afterwards — gate client-only values with it. */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
