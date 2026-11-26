import { useSyncExternalStore } from "react";

// Light and dark modes (the designer's landing page and Parent Dashboard both have a theme
// toggle). Dark uses the design system's dark tokens (data-theme="dark"). As in the designer's
// landing page: the first visit follows the device's setting, then the visitor's choice is
// remembered on this device. A display preference, not personal data. Every page reads the same
// value, so a mode chosen on one page applies on the next.

export type Theme = "light" | "dark";

const STORAGE_KEY = "tibyan.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// The choice made in this visit, for when storage is blocked and cannot remember it.
let chosenTheme: Theme | undefined;
const listeners = new Set<() => void>();

function savedTheme(): Theme | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : undefined;
  } catch {
    // Storage can be blocked: then the device's setting decides.
    return undefined;
  }
}

function deviceTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** The choice made in this visit, or the remembered one, or the device's setting, or light. */
export function readTheme(): Theme {
  return chosenTheme ?? savedTheme() ?? deviceTheme();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Until the visitor chooses, follow the device when its setting changes.
  const query = typeof matchMedia === "function" ? matchMedia(DARK_QUERY) : undefined;
  query?.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    query?.removeEventListener("change", listener);
  };
}

function setTheme(next: Theme): void {
  chosenTheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Without storage the mode still changes; it is only not remembered.
  }
  for (const listener of listeners) listener();
}

/** The current mode and a way to choose one, shared by every page. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  return [useSyncExternalStore(subscribe, readTheme), setTheme];
}
