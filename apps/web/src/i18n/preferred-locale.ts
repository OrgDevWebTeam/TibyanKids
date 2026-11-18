import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, hasLocale, type Locale } from "./config";

/** Saved choice first, then the browser's languages, then the shared default. */
export function pickLocale(saved: string | null, languages: readonly string[]): Locale {
  if (saved && hasLocale(saved)) return saved;

  for (const entry of languages) {
    const language = entry.toLowerCase().split("-")[0];
    if (language && hasLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}

/**
 * The language a page was in, for screens shown when the language itself may have failed to load:
 * the first segment of the path (/ar or /en), else the saved choice. Undefined when neither says.
 */
export function pageLocale(pathname: string, saved: string | null): Locale | undefined {
  const first = pathname.split("/")[1];
  if (first && hasLocale(first)) return first;
  return saved && hasLocale(saved) ? saved : undefined;
}

/** The language the user picked last, if the browser lets us read it. */
export function savedLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Storage can be blocked, for example in a private window.
    return null;
  }
}

/** The language for a visitor whose URL does not name one. */
export function preferredLocale(): Locale {
  return pickLocale(savedLocale(), navigator.languages);
}

/** Saves the language the user picked. */
export function rememberLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Without storage the choice lasts until the next visit to a URL with no language.
  }
}
