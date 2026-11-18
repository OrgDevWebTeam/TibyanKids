import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE } from "./config";
import { pageLocale, pickLocale } from "./preferred-locale";

describe("pickLocale", () => {
  it("uses the saved choice first", () => {
    expect(pickLocale("en", ["ar-JO", "ar"])).toBe("en");
  });

  it("falls back to the browser's first supported language", () => {
    expect(pickLocale(null, ["en-US", "en"])).toBe("en");
    expect(pickLocale(null, ["fr-FR", "ar", "en"])).toBe("ar");
  });

  it("uses the shared default when nothing matches", () => {
    expect(pickLocale(null, [])).toBe(DEFAULT_LOCALE);
    expect(pickLocale(null, ["fr-FR", "de"])).toBe(DEFAULT_LOCALE);
  });

  it("ignores an unsupported saved value", () => {
    expect(pickLocale("fr", ["en-GB"])).toBe("en");
  });

  it("matches a language code regardless of case", () => {
    expect(pickLocale(null, ["AR-jo"])).toBe("ar");
  });
});

describe("pageLocale", () => {
  it("uses the language in the address first", () => {
    expect(pageLocale("/en/dev/ui", "ar")).toBe("en");
    expect(pageLocale("/ar/today", null)).toBe("ar");
  });

  it("falls back to the saved choice", () => {
    expect(pageLocale("/", "en")).toBe("en");
    expect(pageLocale("/offline.html", "ar")).toBe("ar");
  });

  it("knows no language when neither says one", () => {
    expect(pageLocale("/", null)).toBeUndefined();
    expect(pageLocale("/fr/today", "de")).toBeUndefined();
  });
});
