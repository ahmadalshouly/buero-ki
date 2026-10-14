// Per-device preferences (theme, app lock, reminders), kept in localStorage,
// which expo-sqlite provides on iOS and Android.
import { useSyncExternalStore } from "react";
import { authStorage } from "./storage";

export interface Prefs {
  theme: "system" | "light" | "dark";
  appLock: boolean;
  reminders: boolean;
  /** The last city or postcode searched for help nearby. */
  helpPlace?: string;
}

const KEY = "bueroki.prefs";
const DEFAULTS: Prefs = { theme: "system", appLock: false, reminders: true };
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    const raw = authStorage?.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = read();

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    authStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage can be unavailable (private browsing); keep the value in memory.
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}
